const { connectBrowser, disconnectBrowser, searchTwitter, postReply } = require("./lib/browser");
const { generate } = require("./lib/ollama");

(async () => {
  const { browser, page, source } = await connectBrowser();
  console.log("Connected via:", source);

  // Search with different query
  console.log("Searching for 'Kansas City tech' tweets...");
  const tweets = await searchTwitter(page, "Kansas City tech", 3);
  console.log("Found", tweets.length, "tweets");

  if (tweets.length === 0) {
    // Fallback to broader search
    console.log("Trying broader search...");
    const tweets2 = await searchTwitter(page, "startup tech funding 2026", 3);
    console.log("Found", tweets2.length, "tweets with fallback");
    if (tweets2.length === 0) {
      console.log("No tweets found");
      await disconnectBrowser(browser, source);
      return;
    }
    tweets.push(...tweets2);
  }

  // Pick a different target than the first test
  const target = tweets.find(t => t.likes >= 2 && t.text.length > 30) || tweets[0];
  console.log("Target:", target.author, "likes:", target.likes);
  console.log("Text:", target.text.slice(0, 150));
  console.log("URL:", target.tweetUrl);

  // Generate reply with llama3.1:8b (different model per plan)
  console.log("Generating reply with llama3.1:8b...");
  const prompt = `You are @WolfeUpHQ on Twitter. A sharp AI/tech company based in Kansas City. We build autonomous agents and prediction markets. Authoritative but approachable.
Tone: thought_leader - insightful, authoritative takes
Generate a reply to this tweet. Max 240 characters. Be insightful and authoritative. No hashtags. No emojis. Just output the reply text, nothing else.

Tweet by @${target.author}: "${target.text}"

Reply:`;

  const reply = await generate("rtx4090", "llama3.1:8b", prompt);
  const cleanReply = reply.trim().replace(/^["']|["']$/g, "").slice(0, 280);
  console.log("Generated reply:", cleanReply);

  // Post it
  console.log("Posting reply...");
  try {
    const result = await postReply(page, target.tweetUrl, cleanReply);
    console.log("POST SUCCESS:", JSON.stringify(result));
  } catch (e) {
    console.error("POST FAILED:", e.message.slice(0, 200));
  }

  await disconnectBrowser(browser, source);
})().catch((e) => console.error("Fatal:", e.message));
