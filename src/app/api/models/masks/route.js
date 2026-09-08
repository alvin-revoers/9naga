import { NextResponse } from "next/server";
import { getModelMasks, setModelMask, deleteModelMask } from "@/lib/db/repos/aliasRepo.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const masks = await getModelMasks();
    return NextResponse.json({ masks });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch model masks" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { alias, targetModel, systemPrompt, name } = body;
    if (!alias) return NextResponse.json({ error: "Alias required" }, { status: 400 });
    await setModelMask(alias, { targetModel: targetModel || "", systemPrompt: systemPrompt || "", name: name || alias });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to set model mask" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const alias = searchParams.get("alias");
    if (!alias) return NextResponse.json({ error: "Alias required" }, { status: 400 });
    await deleteModelMask(alias);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete model mask" }, { status: 500 });
  }
}
