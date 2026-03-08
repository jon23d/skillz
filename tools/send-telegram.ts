import { tool } from "@opencode-ai/plugin"

export default tool({
  description:
    "Send a Telegram notification message. Use this to notify the user when a task is complete or blocked.",
  args: {
    message: tool.schema.string().describe("The message to send"),
  },
  async execute(args) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID

    if (!botToken || !chatId) {
      return "Telegram not configured — skipping notification"
    }

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: args.message }),
      }
    )

    if (!response.ok) {
      const error = await response.json()
      return `Failed to send Telegram message: ${error.description}`
    }

    return "Notification sent"
  },
})
