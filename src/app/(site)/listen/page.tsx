import ListenRoom from "@/components/ListenRoom";
import { listenMetadata } from "@/lib/share-meta";

type Props = { searchParams: Promise<{ [k: string]: string | string[] | undefined }> };

export function generateMetadata({ searchParams }: Props) {
  return listenMetadata(searchParams, "/listen");
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ListenPage({ searchParams }: Props) {
  const sp = await searchParams;
  return <ListenRoom filter={{ mood: one(sp.mood), genre: one(sp.genre), q: one(sp.q) }} />;
}
