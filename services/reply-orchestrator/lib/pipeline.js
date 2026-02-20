const { generate, generateOpenAI, checkHealth } = require("./ollama");
const log = require("./logger");
const { connectBrowser, disconnectBrowser, searchTwitter, postReply } = require("./browser");

// Helper: route model calls to Ollama or OpenAI based on host
async function callModel(modelConfig, prompt, options) {
  if (modelConfig.host === "openai") {
    return generateOpenAI(modelConfig.model, prompt);
  }
  return generate(modelConfig.host, modelConfig.model, prompt, options);
}

async function runPipeline(config, jobId, emitEvent, approvalResolvers) {
  const {
    searchQueries = ["AI agents"],
    scoringModel = { host: "rtx4090", model: "qwen3:30b-a3b" },
    generationModel = { host: "rtx4090", model: "qwen3:32b" },
    refinementModel = { host: "rtx4090", model: "gemma3:27b" },
    persona = "A sharp, knowledgeable tech commentator. Clever but not try-hard.",
    tone = "witty and insightful",
    maxReplyLength = 240,
    filters = {},
    effort = {},
    autoPost = false,
    dryRun = true,
    scrollCount = 3,
  } = config;

  const minLikes = filters.minLikes || 0;
  const excludeRetweets = filters.excludeRetweets !== false;
  const topNToScore = effort.topNToScore || 20;
  const count = effort.count || 3;
  const candidatesPerTweet = effort.candidatesPerTweet || 3;

  let browser, page, browserSource;
  const results = [];

  try {
    // -- INIT --
    log.info("pipeline", "Pipeline started", { jobId, queries: searchQueries, scoringModel, generationModel, refinementModel, autoPost, dryRun });
    emitEvent({ stage: "INIT", status: "running", message: "Initializing pipeline..." });

    const scoringHealth = await checkHealth(scoringModel.host);
    if (!scoringHealth.online) {
      throw new Error(`Scoring model host ${scoringModel.host} is offline`);
    }

    const genHealth = await checkHealth(generationModel.host);
    if (!genHealth.online) {
      throw new Error(`Generation model host ${generationModel.host} is offline`);
    }

    const conn = await connectBrowser();
    browser = conn.browser;
    page = conn.page;
    browserSource = conn.source;

    emitEvent({
      stage: "INIT",
      status: "done",
      message: `Browser: ${browserSource}, model hosts online`,
    });

    // -- SEARCH --
    // Normalize queries: support both plain strings and {query, target} objects
    const normalizedQueries = searchQueries.map(q =>
      typeof q === "string" ? { query: q, target: "" } : q
    );

    emitEvent({ stage: "SEARCH", status: "running", message: "Starting searches..." });
    log.info("pipeline", "SEARCH stage started", { jobId, queryCount: normalizedQueries.length });
    let allTweets = [];

    for (let i = 0; i < normalizedQueries.length; i++) {
      const queryObj = normalizedQueries[i];
      const queryStr = queryObj.query;
      emitEvent({
        stage: "SEARCH",
        status: "running",
        message: `Searching for '${queryStr}'...`,
        progress: { current: i + 1, total: normalizedQueries.length },
      });

      try {
        const tweets = await searchTwitter(page, queryStr, scrollCount);
        // Tag each tweet with its source target description
        tweets.forEach(t => { t.targetDescription = queryObj.target || ""; });
        allTweets = allTweets.concat(tweets);
        emitEvent({
          stage: "SEARCH",
          status: "running",
          message: `Found ${tweets.length} tweets for '${queryStr}'`,
          progress: { current: i + 1, total: normalizedQueries.length },
        });
      } catch (e) {
        emitEvent({
          stage: "SEARCH",
          status: "running",
          message: `Search failed for '${queryStr}': ${e.message}`,
        });
      }
    }

    emitEvent({
      stage: "SEARCH",
      status: "done",
      message: `Total tweets found: ${allTweets.length}`,
    });
    log.info("pipeline", "SEARCH stage done", { jobId, totalTweets: allTweets.length });

    if (allTweets.length === 0) {
      throw new Error("No tweets found from any search query");
    }

    // -- FILTER --
    emitEvent({ stage: "FILTER", status: "running", message: "Filtering tweets..." });
    log.info("pipeline", "FILTER stage started", { jobId });

    // Deduplicate by URL
    const seen = new Set();
    let filtered = [];
    for (const tweet of allTweets) {
      if (!seen.has(tweet.tweetUrl)) {
        seen.add(tweet.tweetUrl);
        filtered.push(tweet);
      }
    }

    // Apply filters
    if (minLikes > 0) {
      filtered = filtered.filter((t) => t.likes >= minLikes);
    }
    if (excludeRetweets) {
      filtered = filtered.filter((t) => !t.text.startsWith("RT @"));
    }

    // Take top N
    filtered = filtered.slice(0, topNToScore);

    emitEvent({
      stage: "FILTER",
      status: "done",
      message: `${filtered.length} tweets after filtering (from ${allTweets.length} total)`,
    });
    log.info("pipeline", "FILTER stage done", { jobId, filtered: filtered.length, from: allTweets.length });

    if (filtered.length === 0) {
      throw new Error("No tweets passed filters");
    }

    // -- SCORE --
    emitEvent({ stage: "SCORE", status: "running", message: "Scoring tweets..." });
    log.info("pipeline", "SCORE stage started", { jobId, count: filtered.length });

    for (let i = 0; i < filtered.length; i++) {
      const tweet = filtered[i];
      emitEvent({
        stage: "SCORE",
        status: "running",
        message: `Scoring tweet ${i + 1}/${filtered.length} by @${tweet.author}`,
        progress: { current: i + 1, total: filtered.length },
      });

      const prompt = `${tweet.targetDescription ? `Target: ${tweet.targetDescription}\n` : ""}Rate this tweet for reply-worthiness on a scale of 1-10. Consider: engagement potential, topic relevance, opportunity for witty reply. Just output a JSON: {"score": N, "reason": "..."}

Tweet by @${tweet.author}: "${tweet.text}"
Likes: ${tweet.likes}, Retweets: ${tweet.retweets}`;

      try {
        const raw = await callModel(scoringModel, prompt);
        const jsonMatch = raw.match(/\{[\s\S]*?"score"[\s\S]*?\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          tweet.score = parsed.score || 5;
          tweet.scoreReason = parsed.reason || "";
        } else {
          tweet.score = 5;
          tweet.scoreReason = "Could not parse score";
        }
      } catch (e) {
        tweet.score = 5;
        tweet.scoreReason = `Scoring error: ${e.message}`;
      }
    }

    emitEvent({ stage: "SCORE", status: "done", message: "Scoring complete" });
    log.info("pipeline", "SCORE stage done", { jobId, topScores: filtered.slice(0, 5).map(t => ({ author: t.author, score: t.score })) });

    // -- SELECT --
    emitEvent({ stage: "SELECT", status: "running", message: "Selecting top tweets..." });
    log.info("pipeline", "SELECT stage started", { jobId, count });

    filtered.sort((a, b) => (b.score || 0) - (a.score || 0));
    const selected = filtered.slice(0, count);

    emitEvent({
      stage: "SELECT",
      status: "done",
      message: `Selected ${selected.length} tweets (top scores: ${selected.map((t) => t.score).join(", ")})`,
    });

    // -- GENERATE --
    emitEvent({
      stage: "GENERATE",
      status: "running",
      message: "Generating reply candidates...",
    });
    log.info("pipeline", "GENERATE stage started", { jobId, selected: selected.length });

    for (let i = 0; i < selected.length; i++) {
      const tweet = selected[i];
      emitEvent({
        stage: "GENERATE",
        status: "running",
        message: `Generating replies for tweet ${i + 1}/${selected.length} by @${tweet.author}`,
        progress: { current: i + 1, total: selected.length },
      });

      const candidates = [];
      for (let c = 0; c < candidatesPerTweet; c++) {
        const prompt = `You are @WolfeUpHQ on Twitter. ${persona}

RULES (follow these exactly):
- Tone: ${tone}
- Maximum ${maxReplyLength} characters
- NEVER use hashtags (no # symbols at all)
- NEVER add meta-commentary, notes, or explanations about the reply
- NEVER use parenthetical asides like "(sarcasm)" or "(Note: ...)"
- Keep it natural - write like a real person tweeting, not an AI
- Reply ONLY with the tweet text, nothing else before or after it

Tweet by @${tweet.author}: "${tweet.text}"

Reply:`;

        try {
          let reply = await callModel(generationModel, prompt);
          reply = reply.trim().replace(/^["']|["']$/g, "");
          // Strip any hashtags the model snuck in
          reply = reply.replace(/#\w+/g, "").replace(/\s{2,}/g, " ").trim();
          // Strip any meta-commentary in parentheses at the end
          reply = reply.replace(/\s*\(Note:.*?\)\s*$/i, "").trim();
          reply = reply.replace(/\s*\(Adjusted.*?\)\s*$/i, "").trim();
          reply = reply.replace(/\s*\*[^*]+\*\s*$/i, "").trim();
          if (reply.length > maxReplyLength) {
            reply = reply.substring(0, maxReplyLength - 3) + "...";
          }
          candidates.push(reply);
        } catch (e) {
          candidates.push(`[Generation error: ${e.message}]`);
        }
      }

      // Score candidates and pick best
      let bestCandidate = candidates[0];
      let bestScore = 0;

      for (const candidate of candidates) {
        if (candidate.startsWith("[Generation error")) continue;
        const scorePrompt = `Rate this Twitter reply on a scale of 1-10 for quality, wit, and engagement potential. Just output a JSON: {"score": N}

Original tweet by @${tweet.author}: "${tweet.text}"
Reply: "${candidate}"`;

        try {
          const raw = await callModel(scoringModel, scorePrompt);
          const jsonMatch = raw.match(/\{[\s\S]*?"score"[\s\S]*?\}/);
          if (jsonMatch) {
            const s = JSON.parse(jsonMatch[0]).score || 0;
            if (s > bestScore) {
              bestScore = s;
              bestCandidate = candidate;
            }
          }
        } catch (e) {
          // keep current best
        }
      }

      tweet.reply = bestCandidate;
      tweet.replyScore = bestScore;
      tweet.allCandidates = candidates;
    }

    emitEvent({ stage: "GENERATE", status: "done", message: "Reply generation complete" });
    log.info("pipeline", "GENERATE stage done", { jobId, replies: selected.map(t => ({ author: t.author, replyLen: (t.reply||'').length, score: t.replyScore })) });

    // -- REFINE --
    if (refinementModel) {
      emitEvent({ stage: "REFINE", status: "running", message: "Refining replies..." });

      for (let i = 0; i < selected.length; i++) {
        const tweet = selected[i];
        const prompt = `Polish this Twitter reply. Keep it under ${maxReplyLength} characters. Maintain the tone but make it sharper and more engaging. NEVER use hashtags. NEVER add notes or meta-commentary. Output only the refined reply, nothing else.

Original tweet: "${tweet.text}"
Draft reply: "${tweet.reply}"

Refined reply:`;

        try {
          let refined = await callModel(refinementModel, prompt);
          refined = refined.trim().replace(/^["']|["']$/g, "");
          // Strip hashtags and meta-commentary from refined version too
          refined = refined.replace(/#\w+/g, "").replace(/\s{2,}/g, " ").trim();
          refined = refined.replace(/\s*\(Note:.*?\)\s*$/i, "").trim();
          if (refined.length <= maxReplyLength && refined.length > 0) {
            tweet.replyBeforeRefinement = tweet.reply;
            tweet.reply = refined;
          }
        } catch (e) {
          emitEvent({
            stage: "REFINE",
            status: "running",
            message: `Refinement failed for tweet ${i + 1}: ${e.message}`,
          });
        }
      }

      emitEvent({ stage: "REFINE", status: "done", message: "Refinement complete" });
    }

    // -- REVIEW --
    if (!autoPost) {
      emitEvent({
        stage: "REVIEW",
        status: "awaiting_approval",
        message: "Awaiting manual approval before posting",
        tweets: selected.map((t) => ({
          author: t.author,
          text: t.text,
          tweetUrl: t.tweetUrl,
          score: t.score,
          reply: t.reply,
          replyScore: t.replyScore,
        })),
      });

      // Pause and wait for approval
      await new Promise((resolve) => {
        approvalResolvers.set(jobId, resolve);
      });

      emitEvent({ stage: "REVIEW", status: "done", message: "Approved, proceeding to post" });
    }

    // -- POST --
    emitEvent({ stage: "POST", status: "running", message: "Posting replies..." });
    log.info("pipeline", "POST stage started", { jobId, count: selected.length, dryRun });

    let postSuccessCount = 0;
    let postFailCount = 0;

    for (let i = 0; i < selected.length; i++) {
      const tweet = selected[i];
      const result = {
        tweetUrl: tweet.tweetUrl,
        author: tweet.author,
        tweetText: tweet.text,
        reply: tweet.reply,
        score: tweet.score,
        replyScore: tweet.replyScore,
      };

      if (dryRun) {
        result.posted = false;
        result.reason = "dry_run";
        emitEvent({
          stage: "POST",
          status: "running",
          message: `[DRY RUN] Would reply to @${tweet.author}: "${tweet.reply}"`,
          progress: { current: i + 1, total: selected.length },
        });
      } else {
        try {
          const postResult = await postReply(page, tweet.tweetUrl, tweet.reply);
          result.posted = true;
          result.postedUrl = postResult.replyUrl || null;
          result.verified = true;
          postSuccessCount++;
          log.info("pipeline", "Reply posted", { jobId, author: tweet.author, url: postResult.replyUrl || null });
          emitEvent({
            stage: "POST",
            status: "running",
            message: `Posted reply to @${tweet.author}${postResult.replyUrl ? ` (${postResult.replyUrl})` : " (verified)"}`,
            progress: { current: i + 1, total: selected.length },
          });
        } catch (e) {
          result.posted = false;
          result.error = e.message;
          result.verified = true;
          postFailCount++;
          log.error("pipeline", "Reply post failed", { jobId, author: tweet.author, error: e.message });
          emitEvent({
            stage: "POST",
            status: "running",
            message: `FAILED to post reply to @${tweet.author}: ${e.message}`,
            progress: { current: i + 1, total: selected.length },
          });
        }

        // Wait between posts to avoid rate limits
        if (i < selected.length - 1) {
          await page.waitForTimeout(3000);
        }
      }

      results.push(result);
    }

    const summary = dryRun
      ? `Dry run complete: ${selected.length} replies generated`
      : `Posting complete: ${postSuccessCount} posted, ${postFailCount} failed`;
    emitEvent({ stage: "POST", status: "done", message: summary });

    // -- DONE --
    log.info("pipeline", "Pipeline complete", { jobId, results: results.length });
    return results;
  } catch (err) {
    log.error("pipeline", "Pipeline error", { jobId, error: err.message });
    emitEvent({ stage: "ERROR", status: "failed", error: err.message });
    throw err;
  } finally {
    if (browser) {
      await disconnectBrowser(browser, browserSource);
    }
  }
}

module.exports = { runPipeline };
