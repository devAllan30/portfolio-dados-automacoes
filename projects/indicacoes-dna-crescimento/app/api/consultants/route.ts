import { NextResponse } from "next/server";

import {
  addCustomConsultant,
  findConsultantByReference,
  listConsultantOptions,
  removeCustomConsultant,
} from "@/lib/consultants";
import { ManagerUnauthorizedError, requireManagerSession } from "@/lib/manager-auth";
import { publicRdError, RdConfigurationError } from "@/lib/rd";

function errorResponse(error: unknown) {
  if (error instanceof ManagerUnauthorizedError) {
    return NextResponse.json({ message: error.message }, { status: 401 });
  }
  if (error instanceof RdConfigurationError) {
    return NextResponse.json({ message: publicRdError(error) }, { status: 503 });
  }
  return NextResponse.json(
    { message: error instanceof Error ? error.message : "Não foi possível atualizar os consultores." },
    { status: 400 },
  );
}

export async function GET(request: Request) {
  try {
    const reference = new URL(request.url).searchParams.get("reference");
    if (reference) {
      return NextResponse.json({ consultant: await findConsultantByReference(reference) });
    }
    await requireManagerSession(request);
    return NextResponse.json(await listConsultantOptions());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireManagerSession(request);
    const body = (await request.json()) as { name?: unknown };
    const name = typeof body.name === "string" ? body.name : "";
    const consultant = await addCustomConsultant(name);
    return NextResponse.json({ consultant }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireManagerSession(request);
    const body = (await request.json()) as { id?: unknown };
    const id = Number(body.id);
    await removeCustomConsultant(id);
    return NextResponse.json({ removed: true });
  } catch (error) {
    return errorResponse(error);
  }
}
