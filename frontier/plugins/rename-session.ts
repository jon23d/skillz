import { type Plugin, tool } from "@opencode-ai/plugin"

export const RenameSessionPlugin: Plugin = async ({ client }) => {
  return {
    tool: {
      "rename-session": tool({
        description:
          "Rename the current session. Use the format from the git-worktrees skill: '#N - brief description' for tickets, or just 'brief description' without a ticket.",
        args: {
          title: tool.schema
            .string()
            .describe(
              "The new session title, e.g. '#42 - Add user authentication'",
            ),
        },
        async execute(args, context) {
          try {
            await client.session.update({
              path: { id: context.sessionID },
              body: { title: args.title },
            })
            return `Session renamed to: ${args.title}`
          } catch (e: unknown) {
            return `Failed to rename session: ${(e as Error).message}`
          }
        },
      }),
    },
  }
}
