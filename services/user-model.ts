import { generateClient } from 'aws-amplify/api';

export type CloudUserProfile = {
  id: string;
  name: string;
  email: string;
  onboardingCompleted: boolean;
  targetLanguage?: string | null;
  currentLevel?: string | null;
};

type UpsertCloudUserInput = {
  name: string;
  email: string;
  onboardingCompleted: boolean;
  targetLanguage?: string;
  currentLevel?: string;
};

const client = generateClient();

const listUsersByEmailQuery = /* GraphQL */ `
  query ListUsersByEmail($filter: ModelUserFilterInput, $limit: Int) {
    listUsers(filter: $filter, limit: $limit) {
      items {
        id
        name
        email
        onboardingCompleted
        targetLanguage
        currentLevel
      }
    }
  }
`;

const createUserMutation = /* GraphQL */ `
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      id
      name
      email
      onboardingCompleted
      targetLanguage
      currentLevel
    }
  }
`;

const updateUserMutation = /* GraphQL */ `
  mutation UpdateUser($input: UpdateUserInput!) {
    updateUser(input: $input) {
      id
      name
      email
      onboardingCompleted
      targetLanguage
      currentLevel
    }
  }
`;

function sanitize(input: UpsertCloudUserInput): UpsertCloudUserInput {
  return {
    ...input,
    targetLanguage: input.targetLanguage || undefined,
    currentLevel: input.currentLevel || undefined,
  };
}

export async function getUserProfileByEmail(
  email: string
): Promise<CloudUserProfile | null> {
  const response = (await client.graphql({
    query: listUsersByEmailQuery,
    variables: {
      filter: { email: { eq: email } },
      limit: 1,
    },
  })) as { data?: unknown };
  const data = response.data as {
    listUsers?: { items?: Array<CloudUserProfile | null> | null } | null;
  };
  const item = data.listUsers?.items?.find(Boolean) ?? null;
  return item;
}

export async function createUserProfile(
  input: UpsertCloudUserInput
): Promise<CloudUserProfile> {
  const payload = sanitize(input);
  const response = (await client.graphql({
    query: createUserMutation,
    variables: {
      input: payload,
    },
  })) as { data?: unknown };
  const data = response.data as { createUser?: CloudUserProfile | null };
  if (!data.createUser) {
    throw new Error('Failed to create user profile');
  }
  return data.createUser;
}

export async function updateUserProfile(
  id: string,
  input: UpsertCloudUserInput
): Promise<CloudUserProfile> {
  const payload = sanitize(input);
  const response = (await client.graphql({
    query: updateUserMutation,
    variables: {
      input: {
        id,
        ...payload,
      },
    },
  })) as { data?: unknown };
  const data = response.data as { updateUser?: CloudUserProfile | null };
  if (!data.updateUser) {
    throw new Error('Failed to update user profile');
  }
  return data.updateUser;
}

export async function upsertUserProfile(
  id: string | undefined,
  input: UpsertCloudUserInput
): Promise<CloudUserProfile> {
  if (id) {
    return updateUserProfile(id, input);
  }
  const existing = await getUserProfileByEmail(input.email);
  if (existing) {
    return updateUserProfile(existing.id, input);
  }
  return createUserProfile(input);
}
