import type { ColorToken } from "@/server/db/schema";

export interface CategoryOption {
  id: string;
  name: string;
  colorToken: ColorToken;
}
