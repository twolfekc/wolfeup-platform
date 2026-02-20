const { connectBrowser, disconnectBrowser, searchTwitter, postReply } = require("./lib/browser");
const { generate } = require("./lib/ollama");

(async () => {
  const { browser, page, source } = await connectBrowser();
  console.log("Connected via:", source);

  // Search
  console.log("Searching for tweets...");
  const tweets = await searchTwitter(page, "AI agents 2026", 3);
  console.log("Found", tweets.length, "tweets");

  if (tweets.length === 0) {
    console.log("No tweets found");
    await disconnectBrowser(browser, source);
    return;
  }

  // Pick a good target
  const targets = tweets.filter(t => t.likes >= 5 && t.text.length > 40);
  const target = targets[0] || tweets[0];
  console.log("Target:", target.author, "likes:", target.likes);
  console.log("Text:", target.text.slice(0, 150));
  console.log("URL:", target.tweetUrl);

  // Generate reply with Ollama
  console.log("Generating reply with qwen2.5:32b...");
  const prompt = `You are @WolfeUpHQ on Twitter. Sharp AI/tech company voice. We build autonomous agents and prediction markets. Kansas City based. Direct, witty, never corporate-bland.
Tone: savage
Generate a reply to this tweet. Max 240 characters. Be savage. No hashtags. No emojis unless very natural. Just output the reply text, nothing else.

Tweet by @${target.author}: "${target.text}"

Reply:`;

  const reply = await generate("rtx4090", "qwen2.5:32b", prompt);
  const cleanReply = reply.trim().replace(/^["']|["']$/g, "").slice(0, 280);
  console.log("Generated reply:", cleanReply);

  // Post it
  console.log("Posting reply...");
  try {
    const result = await postReply(page, target.tweetUrl, cleanReply);
    console.log("POST SUCCESS:", JSON.stringify(result));
  } catch (e) {
    console.error("POST FAILED:", e.message);
  }

  await disconnectBrowser(browser, source);
})().catch((e) => console.error("Fatal:", e.message));
