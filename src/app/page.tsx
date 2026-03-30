import { redirect } from "next/navigation";
import { tools } from "@/config/tools";

export default function Home() {
  redirect(`/tools/${tools[0].slug}`);
}
