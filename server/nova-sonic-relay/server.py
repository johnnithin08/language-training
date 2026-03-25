"""Nova Sonic WebRTC relay – Python / aiortc edition.

Replaces the Node.js wrtc-based server with a cleaner audio pipeline:
  aiortc (WebRTC) ↔ resample ↔ Nova Sonic (Bedrock bidirectional stream)
"""

import asyncio
import base64
import fractions
import json
import logging
import os
import time
import uuid

import aiohttp
import boto3
import jwt as pyjwt
import numpy as np
import requests as http_requests
from aiohttp import web
from aiortc import (
    MediaStreamTrack,
    RTCConfiguration,
    RTCIceServer,
    RTCPeerConnection,
    RTCSessionDescription,
)
from av import AudioFrame
from jwt.algorithms import RSAAlgorithm

from aws_sdk_bedrock_runtime.client import (
    BedrockRuntimeClient,
    InvokeModelWithBidirectionalStreamOperationInput,
)
from aws_sdk_bedrock_runtime.config import (
    Config,
    HTTPAuthSchemeResolver,
    SigV4AuthScheme,
)
from aws_sdk_bedrock_runtime.models import (
    BidirectionalInputPayloadPart,
    InvokeModelWithBidirectionalStreamInputChunk,
)
from smithy_aws_core.identity.environment import (
    EnvironmentCredentialsResolver,
)

try:
    from aiortc.sdp import candidate_from_sdp as _parse_candidate
except ImportError:
    _parse_candidate = None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("relay")

# ── Load .env (EC2 deployment) ────────────────────────────────────


def _load_env(path: str):
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


_load_env("/app/relay.env")

# ── Config ────────────────────────────────────────────────────────

BEDROCK_REGION = os.environ.get("BEDROCK_REGION", "us-east-1")
KVS_REGION = os.environ.get("KVS_REGION", "eu-west-2")
MODEL_ID = os.environ.get("MODEL_ID", "amazon.nova-sonic-v1:0")
PORT = int(os.environ.get("PORT", "8080"))
USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID", "")
APP_CLIENT_ID = os.environ.get("COGNITO_APP_CLIENT_ID")
KVS_CHANNEL_ARN = os.environ.get("KVS_CHANNEL_ARN", "")

if not USER_POOL_ID:
    raise SystemExit("COGNITO_USER_POOL_ID is required")
if not KVS_CHANNEL_ARN:
    raise SystemExit("KVS_CHANNEL_ARN is required")

SILENCE_B64 = base64.b64encode(b"\x00" * 1600).decode()
FRAME_SAMPLES = 960  # 20 ms at 48 kHz
FRAME_TIME = fractions.Fraction(1, 48000)

# ── Cognito JWT ───────────────────────────────────────────────────

_jwks_cache: dict = {}


def verify_cognito_token(token: str) -> dict:
    region = USER_POOL_ID.split("_")[0]
    issuer = f"https://cognito-idp.{region}.amazonaws.com/{USER_POOL_ID}"
    jwks_url = f"{issuer}/.well-known/jwks.json"
    if jwks_url not in _jwks_cache:
        _jwks_cache[jwks_url] = http_requests.get(jwks_url, timeout=10).json()
    jwks = _jwks_cache[jwks_url]

    header = pyjwt.get_unverified_header(token)
    key_data = next(
        (k for k in jwks["keys"] if k["kid"] == header.get("kid")), None
    )
    if not key_data:
        raise ValueError("Token key not found in JWKS")

    public_key = RSAAlgorithm.from_jwk(key_data)
    return pyjwt.decode(
        token,
        public_key,
        algorithms=["RS256"],
        issuer=issuer,
        audience=APP_CLIENT_ID or None,
        options={"verify_aud": bool(APP_CLIENT_ID)},
    )


# ── KVS ICE ──────────────────────────────────────────────────────

_kvs = boto3.client("kinesisvideo", region_name=KVS_REGION)
_ice_cache: dict = {"servers": None, "expires": 0}


async def get_ice_servers() -> list:
    if _ice_cache["servers"] and time.time() < _ice_cache["expires"]:
        return _ice_cache["servers"]

    loop = asyncio.get_event_loop()

    ep = await loop.run_in_executor(
        None,
        lambda: _kvs.get_signaling_channel_endpoint(
            ChannelARN=KVS_CHANNEL_ARN,
            SingleMasterChannelEndpointConfiguration={
                "Protocols": ["HTTPS"],
                "Role": "MASTER",
            },
        ),
    )
    https_ep = next(
        e["ResourceEndpoint"]
        for e in ep["ResourceEndpointList"]
        if e["Protocol"] == "HTTPS"
    )

    sig = boto3.client(
        "kinesis-video-signaling",
        region_name=KVS_REGION,
        endpoint_url=https_ep,
    )
    ice = await loop.run_in_executor(
        None, lambda: sig.get_ice_server_config(ChannelARN=KVS_CHANNEL_ARN)
    )

    servers = [
        {"urls": "stun:stun.l.google.com:19302"},
        *[
            {
                "urls": s["Uris"],
                "username": s["Username"],
                "credential": s["Password"],
            }
            for s in ice["IceServerList"]
        ],
    ]
    _ice_cache.update(servers=servers, expires=time.time() + 240)
    log.info("Fetched %d ICE servers", len(servers))
    return servers


# ── Audio utilities ───────────────────────────────────────────────


def downsample(pcm: np.ndarray, from_rate: int, to_rate: int) -> np.ndarray:
    if from_rate == to_rate:
        return pcm
    ratio = from_rate / to_rate
    out_len = int(len(pcm) / ratio)
    indices = (np.arange(out_len) * ratio).astype(int)
    np.clip(indices, 0, len(pcm) - 1, out=indices)
    return pcm[indices]


def upsample(pcm: np.ndarray, from_rate: int, to_rate: int) -> np.ndarray:
    if from_rate == to_rate:
        return pcm
    n = int(len(pcm) * to_rate / from_rate)
    return np.interp(
        np.linspace(0, len(pcm) - 1, n),
        np.arange(len(pcm)),
        pcm.astype(np.float64),
    ).astype(np.int16)


# ── Bedrock client factory ────────────────────────────────────────


def _refresh_aws_env():
    """Push current IAM-role credentials into env vars for the experimental SDK."""
    session = boto3.Session(region_name=BEDROCK_REGION)
    creds = session.get_credentials()
    if not creds:
        return
    frozen = creds.get_frozen_credentials()
    os.environ["AWS_ACCESS_KEY_ID"] = frozen.access_key
    os.environ["AWS_SECRET_ACCESS_KEY"] = frozen.secret_key
    if frozen.token:
        os.environ["AWS_SESSION_TOKEN"] = frozen.token


def create_bedrock_client() -> BedrockRuntimeClient:
    _refresh_aws_env()
    return BedrockRuntimeClient(
        Config(
            endpoint_uri=f"https://bedrock-runtime.{BEDROCK_REGION}.amazonaws.com",
            region=BEDROCK_REGION,
            aws_credentials_identity_resolver=EnvironmentCredentialsResolver(),
            http_auth_scheme_resolver=HTTPAuthSchemeResolver(),
            http_auth_schemes={"aws.auth#sigv4": SigV4AuthScheme(service="bedrock")},
        )
    )


# ── AI output track (Nova Sonic → client) ─────────────────────────


class AIOutputTrack(MediaStreamTrack):
    kind = "audio"

    def __init__(self):
        super().__init__()
        self._buf = np.array([], dtype=np.int16)
        self._pts = 0
        self._t0: float | None = None

    def push(self, pcm_16k: bytes):
        """Buffer 16 kHz mono PCM from Nova Sonic for playback at 48 kHz."""
        samples = np.frombuffer(pcm_16k, dtype=np.int16)
        self._buf = np.concatenate([self._buf, upsample(samples, 16000, 48000)])

    def clear(self):
        """Flush buffered audio (called on barge-in)."""
        self._buf = np.array([], dtype=np.int16)

    async def recv(self) -> AudioFrame:
        if self._t0 is None:
            self._t0 = time.time()

        target = self._t0 + self._pts / 48000
        wait = target - time.time()
        if wait > 0:
            await asyncio.sleep(wait)

        if len(self._buf) >= FRAME_SAMPLES:
            data = self._buf[:FRAME_SAMPLES].copy()
            self._buf = self._buf[FRAME_SAMPLES:]
        else:
            data = np.zeros(FRAME_SAMPLES, dtype=np.int16)

        frame = AudioFrame.from_ndarray(
            data.reshape(1, -1), format="s16", layout="mono"
        )
        frame.sample_rate = 48000
        frame.pts = self._pts
        frame.time_base = FRAME_TIME
        self._pts += FRAME_SAMPLES
        return frame


# ── Voice Session ─────────────────────────────────────────────────


class VoiceSession:
    def __init__(self, ws: web.WebSocketResponse):
        self.ws = ws
        self.pc: RTCPeerConnection | None = None
        self.ai_track = AIOutputTrack()
        self.active = False

        self.system_prompt = (
            "You are a friendly language practice partner. "
            "Keep replies concise and natural for spoken conversation."
        )
        self.voice_id = "tiffany"

        self._stream = None
        self._audio_q: asyncio.Queue[bytes] = asyncio.Queue()
        self._prompt = str(uuid.uuid4())
        self._sys_cn = str(uuid.uuid4())
        self._audio_cn = str(uuid.uuid4())
        self._assistant_cns: set[str] = set()

        self._recorded: list[bytes] = []
        self._ai_transcripts: list[dict] = []
        self._tasks: list[asyncio.Task] = []

    # ── public ────────────────────────────────────────────────────

    async def on_message(self, msg: dict):
        t = msg.get("type")

        if t == "session_start":
            self.system_prompt = msg.get("systemPrompt") or self.system_prompt
            self.voice_id = msg.get("voiceId") or self.voice_id
            try:
                servers = await get_ice_servers()
                await self._ws_send({"type": "ice_servers", "iceServers": servers})
            except Exception as e:
                log.error("ICE fetch: %s", e)
                await self._ws_send({"type": "error", "message": str(e)})

        elif t == "sdp_offer":
            await self._setup_webrtc(msg["sdp"])

        elif t == "ice_candidate":
            await self._add_ice(msg.get("candidate"))

        elif t == "end_session":
            await self._end_session()

    async def cleanup(self):
        self.active = False
        for task in self._tasks:
            task.cancel()
        if self._stream:
            try:
                await self._stream.input_stream.close()
            except Exception:
                pass
        if self.pc:
            await self.pc.close()
            self.pc = None

    # ── helpers ───────────────────────────────────────────────────

    async def _ws_send(self, data: dict):
        if not self.ws.closed:
            await self.ws.send_json(data)

    async def _add_ice(self, candidate_info):
        if not self.pc or not candidate_info or not _parse_candidate:
            return
        raw = candidate_info.get("candidate", "")
        if not raw:
            return
        try:
            sdp_str = raw[len("candidate:"):] if raw.startswith("candidate:") else raw
            c = _parse_candidate(sdp_str)
            c.sdpMid = candidate_info.get("sdpMid")
            c.sdpMLineIndex = candidate_info.get("sdpMLineIndex")
            await self.pc.addIceCandidate(c)
        except Exception as e:
            log.debug("ICE add: %s", e)

    # ── WebRTC ────────────────────────────────────────────────────

    async def _setup_webrtc(self, sdp: str):
        try:
            servers = await get_ice_servers()
            ice_servers = [
                RTCIceServer(
                    urls=s["urls"],
                    username=s.get("username", ""),
                    credential=s.get("credential", ""),
                )
                for s in servers
            ]
            self.pc = RTCPeerConnection(
                configuration=RTCConfiguration(iceServers=ice_servers)
            )
            self.pc.addTrack(self.ai_track)

            @self.pc.on("track")
            def _on_track(track):
                if track.kind == "audio":
                    log.info("Client audio track received")
                    self._tasks.append(
                        asyncio.ensure_future(self._ingest_audio(track))
                    )

            @self.pc.on("connectionstatechange")
            async def _on_state():
                state = self.pc.connectionState if self.pc else "closed"
                log.info("PeerConnection: %s", state)
                if state == "connected" and not self.active:
                    await self._start_nova()

            await self.pc.setRemoteDescription(
                RTCSessionDescription(sdp=sdp, type="offer")
            )
            answer = await self.pc.createAnswer()
            await self.pc.setLocalDescription(answer)

            await self._ws_send(
                {"type": "sdp_answer", "sdp": self.pc.localDescription.sdp}
            )
        except Exception as e:
            log.error("WebRTC setup: %s", e)
            await self._ws_send(
                {"type": "error", "message": f"WebRTC failed: {e}"}
            )

    async def _ingest_audio(self, track: MediaStreamTrack):
        """Receive WebRTC audio frames, downsample to 16 kHz, feed to Nova Sonic."""
        n = 0
        while self.active:
            try:
                frame: AudioFrame = await track.recv()
            except Exception:
                break

            arr = frame.to_ndarray()
            if arr.dtype != np.int16:
                arr = (arr * 32767).clip(-32768, 32767).astype(np.int16)

            mono = arr.mean(axis=0).astype(np.int16) if arr.shape[0] > 1 else arr[0]
            pcm = downsample(mono, frame.sample_rate, 16000)
            raw = pcm.tobytes()

            self._recorded.append(raw)
            await self._audio_q.put(raw)

            n += 1
            if n <= 3:
                log.info(
                    "Audio frame %d: sr=%d ch=%d fmt=%s shape=%s",
                    n, frame.sample_rate, len(frame.layout.channels),
                    frame.format.name, arr.shape,
                )
            elif n % 200 == 0:
                log.info("Audio in: %d frames, q=%d", n, self._audio_q.qsize())

    # ── Nova Sonic ────────────────────────────────────────────────

    async def _ns_send(self, obj: dict):
        await self._stream.input_stream.send(
            InvokeModelWithBidirectionalStreamInputChunk(
                value=BidirectionalInputPayloadPart(
                    bytes_=json.dumps(obj).encode()
                )
            )
        )

    async def _start_nova(self):
        self.active = True
        try:
            client = create_bedrock_client()
            self._stream = (
                await client.invoke_model_with_bidirectional_stream(
                    InvokeModelWithBidirectionalStreamOperationInput(
                        model_id=MODEL_ID
                    )
                )
            )

            await self._ns_send(
                {
                    "event": {
                        "sessionStart": {
                            "inferenceConfiguration": {
                                "maxTokens": 1024,
                                "topP": 0.9,
                                "temperature": 0.7,
                            }
                        }
                    }
                }
            )
            await self._ns_send(
                {
                    "event": {
                        "promptStart": {
                            "promptName": self._prompt,
                            "textOutputConfiguration": {"mediaType": "text/plain"},
                            "audioOutputConfiguration": {
                                "mediaType": "audio/lpcm",
                                "sampleRateHertz": 16000,
                                "sampleSizeBits": 16,
                                "channelCount": 1,
                                "voiceId": self.voice_id,
                                "encoding": "base64",
                                "audioType": "SPEECH",
                            },
                        }
                    }
                }
            )

            await self._ns_send(
                {
                    "event": {
                        "contentStart": {
                            "promptName": self._prompt,
                            "contentName": self._sys_cn,
                            "type": "TEXT",
                            "interactive": False,
                            "role": "SYSTEM",
                            "textInputConfiguration": {"mediaType": "text/plain"},
                        }
                    }
                }
            )
            await self._ns_send(
                {
                    "event": {
                        "textInput": {
                            "promptName": self._prompt,
                            "contentName": self._sys_cn,
                            "content": self.system_prompt,
                        }
                    }
                }
            )
            await self._ns_send(
                {
                    "event": {
                        "contentEnd": {
                            "promptName": self._prompt,
                            "contentName": self._sys_cn,
                        }
                    }
                }
            )

            await self._ns_send(
                {
                    "event": {
                        "contentStart": {
                            "promptName": self._prompt,
                            "contentName": self._audio_cn,
                            "type": "AUDIO",
                            "interactive": True,
                            "role": "USER",
                            "audioInputConfiguration": {
                                "mediaType": "audio/lpcm",
                                "sampleRateHertz": 16000,
                                "sampleSizeBits": 16,
                                "channelCount": 1,
                                "audioType": "SPEECH",
                                "encoding": "base64",
                            },
                        }
                    }
                }
            )

            self._tasks.append(asyncio.create_task(self._ns_audio_pump()))
            self._tasks.append(asyncio.create_task(self._ns_event_loop()))
            log.info("Nova Sonic session started")

        except Exception as e:
            log.error("Nova start: %s", e)
            await self._ws_send({"type": "error", "message": str(e)})

    async def _ns_audio_pump(self):
        """Forward client audio queue to Nova Sonic as base64 chunks."""
        while self.active:
            try:
                raw = await asyncio.wait_for(self._audio_q.get(), timeout=0.05)
                b64 = base64.b64encode(raw).decode()
            except asyncio.TimeoutError:
                b64 = SILENCE_B64

            try:
                await self._ns_send(
                    {
                        "event": {
                            "audioInput": {
                                "promptName": self._prompt,
                                "contentName": self._audio_cn,
                                "content": b64,
                            }
                        }
                    }
                )
            except Exception:
                break

    async def _ns_event_loop(self):
        """Process Nova Sonic output: audio → AI track, text → WebSocket."""
        while self.active:
            try:
                output = await self._stream.await_output()
                result = await output[1].receive()

                if not (result.value and result.value.bytes_):
                    continue

                data = json.loads(result.value.bytes_.decode())
                evt = data.get("event", {})

                if "contentStart" in evt:
                    cs = evt["contentStart"]
                    log.info(
                        "contentStart type=%s role=%s",
                        cs.get("type"),
                        cs.get("role"),
                    )
                    if (
                        cs.get("type") == "AUDIO"
                        and cs.get("role") == "ASSISTANT"
                    ):
                        self._assistant_cns.add(cs.get("contentName", ""))
                        await self._ws_send({"type": "ai_audio_start"})

                elif "audioOutput" in evt:
                    self.ai_track.push(
                        base64.b64decode(evt["audioOutput"]["content"])
                    )

                elif "textOutput" in evt:
                    to = evt["textOutput"]
                    t = {
                        "role": to.get("role", ""),
                        "text": to.get("content", ""),
                    }
                    await self._ws_send({"type": "transcript", **t})
                    self._ai_transcripts.append(t)

                elif "contentEnd" in evt:
                    ce = evt["contentEnd"]
                    cn = ce.get("contentName", "")
                    stop = ce.get("stopReason", "")
                    if stop == "INTERRUPTED":
                        log.info("Barge-in detected")
                        self.ai_track.clear()
                        await self._ws_send({"type": "barge_in"})
                    elif cn in self._assistant_cns:
                        self._assistant_cns.discard(cn)
                        await self._ws_send({"type": "ai_audio_end"})

            except Exception as e:
                if self.active:
                    log.error("NS recv: %s", e)
                break

    # ── End session / Analysis ────────────────────────────────────

    async def _end_session(self):
        log.info("Ending session, starting analysis…")
        self.active = False

        for task in self._tasks:
            task.cancel()
        self._tasks.clear()

        if self._stream:
            try:
                await self._ns_send(
                    {
                        "event": {
                            "contentEnd": {
                                "promptName": self._prompt,
                                "contentName": self._audio_cn,
                            }
                        }
                    }
                )
                await self._ns_send(
                    {"event": {"promptEnd": {"promptName": self._prompt}}}
                )
                await self._ns_send({"event": {"sessionEnd": {}}})
                await self._stream.input_stream.close()
            except Exception:
                pass
            self._stream = None

        if self.pc:
            await self.pc.close()
            self.pc = None

        await self._ws_send({"type": "analyzing"})

        try:
            result = await self._analyze()
            await self._ws_send({"type": "analysis", "data": result})
        except Exception as e:
            log.error("Analysis: %s", e)
            await self._ws_send(
                {"type": "error", "message": f"Analysis failed: {e}"}
            )

        self._recorded.clear()
        self._ai_transcripts.clear()

    async def _analyze(self) -> dict:
        if not self._recorded:
            raise ValueError("No audio recorded for analysis")

        client = create_bedrock_client()
        stream = await client.invoke_model_with_bidirectional_stream(
            InvokeModelWithBidirectionalStreamOperationInput(model_id=MODEL_ID)
        )

        pn = str(uuid.uuid4())
        scn = str(uuid.uuid4())
        acn = str(uuid.uuid4())
        ai_text = "\n".join(
            f"{t['role']}: {t['text']}" for t in self._ai_transcripts
        )

        async def send(obj):
            await stream.input_stream.send(
                InvokeModelWithBidirectionalStreamInputChunk(
                    value=BidirectionalInputPayloadPart(
                        bytes_=json.dumps(obj).encode()
                    )
                )
            )

        await send(
            {
                "event": {
                    "sessionStart": {
                        "inferenceConfiguration": {
                            "maxTokens": 4096,
                            "topP": 0.9,
                            "temperature": 0.3,
                        }
                    }
                }
            }
        )
        await send(
            {
                "event": {
                    "promptStart": {
                        "promptName": pn,
                        "textOutputConfiguration": {"mediaType": "text/plain"},
                        "audioOutputConfiguration": {
                            "mediaType": "audio/lpcm",
                            "sampleRateHertz": 16000,
                            "sampleSizeBits": 16,
                            "channelCount": 1,
                            "voiceId": self.voice_id,
                            "encoding": "base64",
                            "audioType": "SPEECH",
                        },
                    }
                }
            }
        )

        await send(
            {
                "event": {
                    "contentStart": {
                        "promptName": pn,
                        "contentName": scn,
                        "type": "TEXT",
                        "interactive": False,
                        "role": "SYSTEM",
                        "textInputConfiguration": {"mediaType": "text/plain"},
                    }
                }
            }
        )
        await send(
            {
                "event": {
                    "textInput": {
                        "promptName": pn,
                        "contentName": scn,
                        "content": _analysis_prompt(ai_text),
                    }
                }
            }
        )
        await send(
            {"event": {"contentEnd": {"promptName": pn, "contentName": scn}}}
        )

        await send(
            {
                "event": {
                    "contentStart": {
                        "promptName": pn,
                        "contentName": acn,
                        "type": "AUDIO",
                        "interactive": True,
                        "role": "USER",
                        "audioInputConfiguration": {
                            "mediaType": "audio/lpcm",
                            "sampleRateHertz": 16000,
                            "sampleSizeBits": 16,
                            "channelCount": 1,
                            "audioType": "SPEECH",
                            "encoding": "base64",
                        },
                    }
                }
            }
        )
        for chunk in self._recorded:
            await send(
                {
                    "event": {
                        "audioInput": {
                            "promptName": pn,
                            "contentName": acn,
                            "content": base64.b64encode(chunk).decode(),
                        }
                    }
                }
            )

        await send(
            {"event": {"contentEnd": {"promptName": pn, "contentName": acn}}}
        )
        await send({"event": {"promptEnd": {"promptName": pn}}})
        await send({"event": {"sessionEnd": {}}})
        await stream.input_stream.close()

        parts: list[str] = []
        while True:
            try:
                output = await asyncio.wait_for(
                    stream.await_output(), timeout=60
                )
                result = await output[1].receive()
                if result.value and result.value.bytes_:
                    d = json.loads(result.value.bytes_.decode())
                    if "textOutput" in d.get("event", {}):
                        parts.append(d["event"]["textOutput"]["content"])
            except Exception:
                break

        full = "".join(parts)
        log.info("Analysis text: %s", full[:500])

        i, j = full.find("{"), full.rfind("}")
        if i == -1 or j == -1:
            raise ValueError("No JSON in analysis output")
        return json.loads(full[i : j + 1])


# ── Analysis prompt ───────────────────────────────────────────────


def _analysis_prompt(ai_text: str) -> str:
    return (
        "You are an expert English language assessor. You are about to hear "
        "a recording of a language learner practicing spoken English.\n\n"
        "The AI assistant's side of the conversation is provided below as text "
        "for context. Analyze ONLY the learner's speech — do not evaluate the "
        "assistant.\n\n"
        "### CONVERSATION CONTEXT (AI assistant responses):\n"
        f"{ai_text}\n\n"
        "### YOUR TASK:\n"
        "Listen carefully to the learner's audio and provide a structured "
        "assessment.\n\n"
        "### SCORING CRITERIA (0-10):\n"
        "grammar – Correct use of tense, sentence structure, and agreement\n"
        "fluency – Natural flow, speaking pace, hesitations, filler words, "
        "and ease of expression\n"
        "pronunciation – Accent clarity, word-level pronunciation accuracy, "
        "intonation patterns, and stress placement\n"
        "vocabulary – Range and appropriateness of vocabulary\n"
        "coherence – Logical connection of ideas and clarity across sentences\n"
        "overall – Balanced average of the above scores\n\n"
        "### ALSO PROVIDE:\n"
        "- cefr_level (A1, A2, B1, B2, C1, or C2)\n"
        "- strengths (3-5 short bullet points)\n"
        "- weaknesses (3-5 short bullet points)\n"
        "- common_mistakes (list repeated or important mistakes)\n"
        '- corrected_examples (up to 5): Each item: { "original": "...", '
        '"corrected": "..." }\n'
        "- suggestions (3-5 actionable tips)\n\n"
        "### RULES:\n"
        "- Be consistent and objective\n"
        "- Score conservatively (avoid scores above 8 unless clearly advanced)\n"
        "- Focus on patterns, not one-off mistakes\n"
        "- Be constructive and encouraging\n"
        "- For pronunciation: comment on specific sounds, stress patterns, or "
        "intonation issues\n"
        "- Output a single compact JSON object only (no markdown fences, no "
        "preamble, no closing remarks)\n\n"
        "### OUTPUT FORMAT (STRICT):\n"
        "Return ONLY valid JSON:\n"
        "{"
        '"scores":{"grammar":0,"fluency":0,"pronunciation":0,"vocabulary":0,'
        '"coherence":0,"overall":0},'
        '"cefr_level":"B1","strengths":[],"weaknesses":[],'
        '"common_mistakes":[],"corrected_examples":[],"suggestions":[]'
        "}"
    )


# ── aiohttp handler ──────────────────────────────────────────────


async def _handler(request: web.Request):
    if not request.headers.get("Sec-WebSocket-Key"):
        return web.Response(text="nova-sonic-relay ok")

    token = request.query.get("token", "")
    if not token:
        return web.Response(status=401, text="Missing token")

    try:
        verify_cognito_token(token)
    except Exception as e:
        log.warning("Auth: %s", e)
        return web.Response(status=401, text="Unauthorized")

    ws = web.WebSocketResponse()
    await ws.prepare(request)
    log.info("Client connected")

    session = VoiceSession(ws)
    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                await session.on_message(json.loads(msg.data))
            elif msg.type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSE):
                break
    except Exception as e:
        log.error("WS: %s", e)
    finally:
        await session.cleanup()
        log.info("Client disconnected")

    return ws


# ── Main ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    app = web.Application()
    app.router.add_get("/", _handler)
    web.run_app(app, port=PORT)
