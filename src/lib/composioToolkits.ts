export interface ComposioToolkitDefinition {
  slug: string;
  name: string;
  description: string;
  color: string;
  syncable?: boolean;
}

export const DEFAULT_ENABLED_COMPOSIO_TOOLKITS = ["github", "gmail"];

export const COMPOSIO_TOOLKITS: ComposioToolkitDefinition[] = [
  {
    slug: "github",
    name: "GitHub",
    description: "Sync repository READMEs into the memory vault.",
    color: "slate",
    syncable: true,
  },
  {
    slug: "gmail",
    name: "Gmail",
    description: "Import recent inbox messages as read-only context.",
    color: "red",
    syncable: true,
  },
  {
    slug: "slack",
    name: "Slack",
    description: "Connect workspace messaging for future context sync.",
    color: "purple",
  },
  {
    slug: "notion",
    name: "Notion",
    description: "Connect pages and databases for future context sync.",
    color: "slate",
  },
  {
    slug: "googlecalendar",
    name: "Google Calendar",
    description: "Connect calendar events for scheduling context.",
    color: "blue",
  },
  {
    slug: "googledrive",
    name: "Google Drive",
    description: "Connect Drive files for document context.",
    color: "green",
  },
  {
    slug: "linear",
    name: "Linear",
    description: "Connect issues and projects for work context.",
    color: "indigo",
  },
  {
    slug: "jira",
    name: "Jira",
    description: "Connect tickets and boards for work context.",
    color: "blue",
  },
  {
    slug: "discord",
    name: "Discord",
    description: "Connect servers and channels for community context.",
    color: "indigo",
  },
  {
    slug: "trello",
    name: "Trello",
    description: "Connect boards and cards for planning context.",
    color: "sky",
  },
  {
    slug: "asana",
    name: "Asana",
    description: "Connect tasks and projects for work context.",
    color: "rose",
  },
  {
    slug: "dropbox",
    name: "Dropbox",
    description: "Connect files for document context.",
    color: "blue",
  },
];

export function toolkitBySlug(slug: string): ComposioToolkitDefinition | undefined {
  return COMPOSIO_TOOLKITS.find((toolkit) => toolkit.slug === slug);
}

export function toolkitDisplayName(slug: string): string {
  return toolkitBySlug(slug)?.name ?? slug.replace(/_/g, " ");
}
