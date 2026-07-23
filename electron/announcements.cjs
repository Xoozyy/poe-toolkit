/**
 * GGG Tracker activity feed (JSON has forum_name; RSS does not).
 * https://gggtracker.com/activity.json
 */
const ACTIVITY_URL = 'https://gggtracker.com/activity.json';
const FORUM_NAME = 'Announcements';
const LIMIT = 5;
const FETCH_TIMEOUT_MS = 12_000;

function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function excerpt(html, max = 140) {
  const text = stripHtml(html);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function postUrl(data) {
  const host = data.host || 'www.pathofexile.com';
  return `https://${host}/forum/view-post/${data.id}`;
}

async function fetchAnnouncements(limit = LIMIT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(ACTIVITY_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return { ok: false, error: `Tracker returned ${res.status}`, items: [] };
    }
    const json = await res.json();
    const activity = Array.isArray(json?.activity) ? json.activity : [];

    const seenThreads = new Set();
    const items = [];
    for (const entry of activity) {
      const data = entry?.data;
      if (!data || entry.type !== 'forum_post') continue;
      if (data.forum_name !== FORUM_NAME) continue;
      const threadKey = data.thread_id ?? data.id;
      if (seenThreads.has(threadKey)) continue;
      seenThreads.add(threadKey);
      items.push({
        id: String(data.id),
        title: data.thread_title || 'Untitled',
        poster: data.poster || 'GGG',
        time: data.time || null,
        url: postUrl(data),
        excerpt: excerpt(data.body_html),
      });
      if (items.length >= limit) break;
    }

    return { ok: true, items };
  } catch (err) {
    const message =
      err?.name === 'AbortError'
        ? 'Timed out fetching announcements'
        : String(err?.message || err);
    return { ok: false, error: message, items: [] };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchAnnouncements };
