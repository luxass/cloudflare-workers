import { gql } from "github-schema";

export const REPOSITORY_FRAGMENT = gql`
#graphql
fragment RepositoryFragment on Repository {
  id
  name
  isFork
  isArchived
  nameWithOwner
  description
  pushedAt
  url
  defaultBranchRef {
    name
  }
  primaryLanguage {
    name
    color
  }
}
`;

export const PROFILE_QUERY = gql`
#graphql
${REPOSITORY_FRAGMENT}

query getProfile {
  viewer {
    repositories(
      first: 100
      isFork: false
      privacy: PUBLIC
      ownerAffiliations: [OWNER]
      orderBy: { field: STARGAZERS, direction: DESC }
    ) {
      totalCount
      nodes {
        ...RepositoryFragment
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
}
`;
