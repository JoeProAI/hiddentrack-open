import { tracks, songId, indexForSlug } from "@/lib/fresh-cuts";
import { remuxAudio } from "@/lib/m4a-remux";

// Downloads the audio-only .m4a, remuxed (no re-encode) from the MP4 Suno publishes
// for every public song. If the remux fails, it serves the original MP4 instead.
export const maxDuration = 60;

const mp4Url = (id: string) => `https://cdn1.suno.ai/${id}.mp4`;

const filename = (title: string, ext: string) => {
  const clean = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 '&,.()-]+/g, "").trim() || "Track";
  return `${clean} - Hidden Track.${ext}`;
};

const disposition = (name: string) => `attachment; filename="${name.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const i = indexForSlug(slug);
  if (i < 0) return new Response("We couldn't find that track.", { status: 404 });
  const track = tracks[i];

  const upstream = await fetch(mp4Url(songId(track.href)), { cache: "no-store" });
  if (!upstream.ok) {
    return new Response("This download isn't available right now. Try again in a minute, or open the song on Suno.", { status: 502 });
  }
  const src = new Uint8Array(await upstream.arrayBuffer());

  try {
    const { header, chunks, byteLength } = remuxAudio(src);
    let next = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(header); },
      pull(controller) {
        // Send the audio in ~256 KB slices so the response streams.
        let sent = 0;
        while (next < chunks.length && sent < 256 * 1024) {
          const [off, len] = chunks[next++];
          controller.enqueue(src.subarray(off, off + len));
          sent += len;
        }
        if (next >= chunks.length) controller.close();
      },
    });
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "audio/mp4",
        "Content-Length": String(byteLength),
        "Content-Disposition": disposition(filename(track.title, "m4a")),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("m4a remux failed, serving mp4", slug, err);
    return new Response(src, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(src.length),
        "Content-Disposition": disposition(filename(track.title, "mp4")),
        "Cache-Control": "public, max-age=3600",
      },
    });
  }
}
