"""Nova Sonic WebRTC relay – Python / aiortc edition.

Replaces the Node.js wrtc-based server with a cleaner audio pipeline:
  aiortc (WebRTC) ↔ resample ↔ Nova Sonic (Bedrock bidirectional stream)

Post-session analysis: a second Nova Sonic stream (recorded user audio +
system prompt) collects ASSISTANT textOutput as JSON.
"""

import asyncio
import base64
import fractions
import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone

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
from aws_sdk_bedrock_runtime.config import Config
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
BEDROCK_TEXT_REGION = os.environ.get("BEDROCK_TEXT_REGION", "eu-west-2")
KVS_REGION = os.environ.get("KVS_REGION", "eu-west-2")
MODEL_ID = os.environ.get("MODEL_ID", "amazon.nova-sonic-v1:0")
PORT = int(os.environ.get("PORT", "8080"))
USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID", "")
APP_CLIENT_ID = os.environ.get("COGNITO_APP_CLIENT_ID")
KVS_CHANNEL_ARN = os.environ.get("KVS_CHANNEL_ARN", "")
SESSION_TABLE_NAME = os.environ.get("SESSION_TABLE_NAME", "")

if not USER_POOL_ID:
    raise SystemExit("COGNITO_USER_POOL_ID is required")
if not KVS_CHANNEL_ARN:
    raise SystemExit("KVS_CHANNEL_ARN is required")
if not SESSION_TABLE_NAME:
    raise SystemExit("SESSION_TABLE_NAME is required")

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
    def __init__(self, ws: web.WebSocketResponse, *, user_sub: str = ""):
        self.ws = ws
        self.pc: RTCPeerConnection | None = None
        self.ai_track = AIOutputTrack()
        self.active = False

        self.user_sub = user_sub
        self.category_id = "free-talk"
        self.target_language = "English"
        self.language_level = ""

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
            self.category_id = msg.get("categoryId") or self.category_id
            self.target_language = msg.get("targetLanguage") or self.target_language
            self.language_level = msg.get("languageLevel") or self.language_level
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
        # Wait for Nova Sonic session to be ready
        while not self.active:
            await asyncio.sleep(0.05)
        log.info("Audio ingestion started")

        n = 0
        while self.active:
            try:
                frame: AudioFrame = await track.recv()
            except Exception:
                break

            arr = frame.to_ndarray()
            if arr.dtype != np.int16:
                arr = (arr * 32767).clip(-32768, 32767).astype(np.int16)

            channels = len(frame.layout.channels)
            if channels > 1 and arr.shape[0] == 1:
                # Packed/interleaved stereo: [L0,R0,L1,R1,...] in shape (1, N*ch)
                flat = arr[0]
                acc = np.zeros(len(flat) // channels, dtype=np.int32)
                for ch in range(channels):
                    acc += flat[ch::channels].astype(np.int32)
                mono = (acc // channels).astype(np.int16)
            elif arr.shape[0] > 1:
                # Planar stereo: shape (ch, N)
                mono = arr.mean(axis=0).astype(np.int16)
            else:
                mono = arr[0]
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
        n = 0
        log.info("Audio pump started")
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
                n += 1
                if n <= 3 or n % 500 == 0:
                    log.info("Sent audio chunk %d to Nova Sonic (%d bytes)", n, len(b64))
            except Exception as e:
                log.error("Audio pump send error: %s", e)
                break
        log.info("Audio pump exited (sent %d chunks)", n)

    async def _ns_event_loop(self):
        """Process Nova Sonic output: audio → AI track, text → WebSocket."""
        log.info("Event loop started, waiting for Nova Sonic output...")
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
                    log.error("NS recv error: %s", e)
                    import traceback
                    log.error("NS recv traceback: %s", traceback.format_exc())
                break
        log.info("Event loop exited")

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

        # Let the CRT fully tear down the live stream before opening a new one
        await asyncio.sleep(2)

        try:
            analysis = await self._analyze()
            session_id = await self._save_session(analysis)
            await self._ws_send(
                {"type": "session_complete", "sessionId": session_id}
            )
        except Exception as e:
            log.error("Analysis/save: %s", e)
            await self._ws_send(
                {"type": "error", "message": f"Analysis failed: {e}"}
            )

        self._recorded.clear()
        self._ai_transcripts.clear()

    async def _analyze(self) -> dict:
        return await self._analyze_nova_sonic()

    async def _analyze_nova_sonic(self) -> dict:
        """Separate bidirectional stream: system text + user audio → text JSON."""
        if not self._recorded:
            raise ValueError("No audio recorded for Sonic analysis")

        client = create_bedrock_client()
        stream = await client.invoke_model_with_bidirectional_stream(
            InvokeModelWithBidirectionalStreamOperationInput(model_id=MODEL_ID)
        )

        pn = str(uuid.uuid4())
        scn = str(uuid.uuid4())
        acn = str(uuid.uuid4())
        sys_text = _sonic_analysis_system_text(
            self._ai_transcripts, self.language_level
        )

        async def send(obj: dict):
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
                            "temperature": 0.2,
                        }
                    }
                }
            }
        )
        # Text output for JSON; audio output is still declared (Sonic contract)
        # — we ignore audioOutput events in the drain loop.
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
                        "content": sys_text,
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

        log.info(
            "Analysis: sending %d recorded audio chunks…", len(self._recorded)
        )
        for i, chunk in enumerate(self._recorded):
            try:
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
            except Exception as e:
                log.error("Analysis audio send error at chunk %d: %s", i, e)
                break
            # ~5x real-time pacing (each chunk ≈ 20ms audio → send every ~4ms)
            if i % 5 == 4:
                await asyncio.sleep(0.02)

        log.info("Analysis: audio sent, closing input…")
        await send(
            {"event": {"contentEnd": {"promptName": pn, "contentName": acn}}}
        )
        await send({"event": {"promptEnd": {"promptName": pn}}})
        await send({"event": {"sessionEnd": {}}})
        await stream.input_stream.close()

        full_text = await _drain_sonic_analysis_text(stream)
        log.info("Sonic analysis assembled text: %s", full_text[:800])
        return _parse_analysis_json(full_text)

    async def _save_session(self, analysis: dict) -> str:
        """Write session + analysis to DynamoDB and return the session id."""
        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        table = boto3.resource(
            "dynamodb", region_name=BEDROCK_TEXT_REGION
        ).Table(SESSION_TABLE_NAME)

        item = {
            "id": session_id,
            "__typename": "Session",
            "categoryId": self.category_id,
            "targetLanguage": self.target_language,
            "analysisJson": json.dumps(analysis),
            "owner": self.user_sub,
            "createdAt": now,
            "updatedAt": now,
        }

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: table.put_item(Item=item))
        log.info("Saved session %s for owner %s", session_id, self.user_sub)
        return session_id


# ── Analysis helpers ──────────────────────────────────────────────


def _parse_analysis_json(text: str) -> dict:
    i, j = text.find("{"), text.rfind("}")
    if i == -1 or j == -1 or j <= i:
        raise ValueError("No JSON in analysis output")
    return json.loads(text[i : j + 1])


async def _drain_sonic_analysis_text(stream) -> str:
    """Collect ASSISTANT textOutput from a Nova Sonic stream until completionEnd."""
    assistant_parts: list[str] = []
    all_text_parts: list[str] = []
    deadline = time.monotonic() + 180.0
    completion_seen = False

    while time.monotonic() < deadline:
        try:
            wait = min(45.0, deadline - time.monotonic())
            if wait <= 0:
                break
            output = await asyncio.wait_for(stream.await_output(), timeout=wait)
            result = await output[1].receive()
        except StopAsyncIteration:
            break
        except asyncio.TimeoutError:
            if completion_seen:
                break
            continue
        except Exception as e:
            log.warning("Sonic analysis drain: %s", e)
            break

        if not (result.value and result.value.bytes_):
            continue
        try:
            d = json.loads(result.value.bytes_.decode())
        except json.JSONDecodeError:
            continue

        evt = d.get("event", {})
        if "textOutput" in evt:
            to = evt["textOutput"]
            role = (to.get("role") or "").strip().upper()
            content = to.get("content") or ""
            all_text_parts.append(content)
            if role == "ASSISTANT":
                assistant_parts.append(content)
        if "completionEnd" in evt:
            completion_seen = True
            tail_deadline = time.monotonic() + 12.0
            while time.monotonic() < tail_deadline:
                try:
                    output = await asyncio.wait_for(
                        stream.await_output(), timeout=3.0
                    )
                    result = await output[1].receive()
                except (asyncio.TimeoutError, StopAsyncIteration, Exception):
                    break
                if not (result.value and result.value.bytes_):
                    continue
                try:
                    d = json.loads(result.value.bytes_.decode())
                except json.JSONDecodeError:
                    continue
                evt = d.get("event", {})
                if "textOutput" in evt:
                    to = evt["textOutput"]
                    role = (to.get("role") or "").strip().upper()
                    content = to.get("content") or ""
                    all_text_parts.append(content)
                    if role == "ASSISTANT":
                        assistant_parts.append(content)
            break

    merged = "".join(assistant_parts).strip()
    if merged:
        return merged
    # Rare: model put JSON in a non-ASSISTANT textOutput
    return "".join(all_text_parts).strip()


def _sonic_analysis_system_text(
    ai_transcripts: list[dict], language_level: str
) -> str:
    ai_lines = "\n".join(
        f"{t.get('role', '')}: {t.get('text', '')}" for t in ai_transcripts
    )
    level = (
        f"\n\nLearner self-reported level: {language_level}. "
        f"Use for scoring context; evidence from audio takes priority.\n"
        if language_level.strip()
        else ""
    )
    return (
        "You are an expert English assessor. The learner's practice session "
        "audio will arrive next as USER audio (16 kHz speech).\n\n"
        "### ASSISTANT SIDE OF THE CONVERSATION (text, for context only)\n"
        f"{ai_lines or '(none)'}\n"
        f"{level}\n"
        "### TASK\n"
        "Listen to the learner's audio. Assess their spoken English: "
        "grammar, fluency, pronunciation (from sound), vocabulary, coherence. "
        "Do not evaluate the assistant.\n\n"
        "You MUST respond with a single JSON object only in your ASSISTANT "
        "text output — no markdown fences, no preamble, no spoken "
        "conversational filler before or after the JSON. Ignore any separate "
        "speech synthesis; the app reads only your text channel.\n\n"
        "### OUTPUT (STRICT JSON ONLY)\n"
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
        claims = verify_cognito_token(token)
    except Exception as e:
        log.warning("Auth: %s", e)
        return web.Response(status=401, text="Unauthorized")

    user_sub = claims.get("sub", "")

    ws = web.WebSocketResponse()
    await ws.prepare(request)
    log.info("Client connected (sub=%s)", user_sub)

    session = VoiceSession(ws, user_sub=user_sub)
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
