import { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

import { openMySqlConnection } from "@/lib/mysql";
import { DISTRIBUTION_TEAM_ID, rdRequest } from "@/lib/rd";

const DEFAULT_BASE_URL = "https://indicacoes.napraticaclub.com.br";

type TeamUser = {
  id?: string;
  _id?: string;
  name?: string;
  email?: string;
};

type Team = {
  id?: string;
  _id?: string;
  name?: string;
  team_users?: TeamUser[];
};

type TeamsResponse = { teams?: Team[] };

type ConsultantRow = RowDataPacket & {
  Id: number;
  nome: string;
  Ativo: number;
  Tipo: "Cadastrado" | "Time RD";
  link_referencia: string;
};

export type TeamMember = {
  id: number;
  rdUserId: string;
  name: string;
  email: string;
  active: boolean;
  type: "Time RD";
  linkReference: string;
};

export type CustomConsultant = {
  id: number;
  name: string;
  active: boolean;
  type: "Cadastrado";
  linkReference: string;
};

export type ConsultantOption = {
  key: string;
  name: string;
  source: "team" | "custom";
  linkReference: string;
};

function normalizeName(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleUpperCase("pt-BR");
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function baseUrl() {
  return (process.env.INDICATION_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function linkForName(name: string) {
  const reference = slugify(name);
  if (!reference) throw new Error("Não foi possível gerar o link desse consultor.");
  return `${baseUrl()}/${reference}`;
}

function referenceFromLink(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "").toLocaleLowerCase("pt-BR");
  } catch {
    return decodeURIComponent(raw.split(/[/?#]/).filter(Boolean).at(-1) ?? "").toLocaleLowerCase("pt-BR");
  }
}

function randomItem<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

export async function listTeamMembers(): Promise<TeamMember[]> {
  const response = await rdRequest<TeamsResponse>("/teams");
  const team = response.teams?.find(
    (item) => (item.id ?? item._id) === DISTRIBUTION_TEAM_ID,
  );

  const rdMembers = (team?.team_users ?? [])
    .map((user) => ({
      rdUserId: user.id ?? user._id ?? "",
      name: user.name?.trim() ?? "",
      email: user.email?.trim() ?? "",
    }))
    .filter((user) => /^[a-fA-F0-9]{24}$/.test(user.rdUserId) && user.name)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  if (!rdMembers.length) {
    throw new Error("A equipe de distribuição não possui usuários disponíveis.");
  }

  const connection = await openMySqlConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      "UPDATE consultores_indicacao SET Ativo = 0 WHERE Tipo = 'Time RD'",
    );

    for (const member of rdMembers) {
      const name = normalizeName(member.name);
      const linkReference = linkForName(name);
      const [existing] = await connection.execute<ConsultantRow[]>(
        "SELECT Id, nome, Ativo, Tipo, link_referencia FROM consultores_indicacao WHERE UPPER(nome) = ? LIMIT 1",
        [name],
      );

      if (existing.length) {
        await connection.execute(
          "UPDATE consultores_indicacao SET nome = ?, Ativo = 1, Tipo = 'Time RD', link_referencia = ? WHERE Id = ?",
          [name, linkReference, existing[0].Id],
        );
      } else {
        await connection.execute(
          "INSERT INTO consultores_indicacao (nome, Ativo, Tipo, link_referencia) VALUES (?, 1, 'Time RD', ?)",
          [name, linkReference],
        );
      }
    }

    await connection.commit();
    const [rows] = await connection.query<ConsultantRow[]>(
      "SELECT Id, nome, Ativo, Tipo, link_referencia FROM consultores_indicacao WHERE Ativo = 1 AND Tipo = 'Time RD' ORDER BY nome",
    );

    return rows.map((row) => {
      const member = rdMembers.find(
        (item) => normalizeName(item.name) === normalizeName(row.nome),
      );
      if (!member) throw new Error("Não foi possível relacionar um usuário sincronizado do RD Station.");
      return {
        id: Number(row.Id),
        rdUserId: member.rdUserId,
        name: row.nome,
        email: member.email,
        active: Boolean(row.Ativo),
        type: "Time RD" as const,
        linkReference: row.link_referencia,
      };
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

export async function listCustomConsultants(): Promise<CustomConsultant[]> {
  const connection = await openMySqlConnection();
  try {
    const [rows] = await connection.query<ConsultantRow[]>(
      "SELECT Id, nome, Ativo, Tipo, link_referencia FROM consultores_indicacao WHERE Ativo = 1 AND Tipo = 'Cadastrado' ORDER BY nome",
    );
    for (const row of rows) {
      const currentLink = linkForName(row.nome);
      if (row.link_referencia !== currentLink) {
        await connection.execute(
          "UPDATE consultores_indicacao SET link_referencia = ? WHERE Id = ?",
          [currentLink, row.Id],
        );
        row.link_referencia = currentLink;
      }
    }
    return rows.map((row) => ({
      id: Number(row.Id),
      name: row.nome,
      active: Boolean(row.Ativo),
      type: "Cadastrado" as const,
      linkReference: row.link_referencia,
    }));
  } finally {
    await connection.end();
  }
}

export async function listConsultantOptions() {
  const [teamMembers, customConsultants] = await Promise.all([
    listTeamMembers(),
    listCustomConsultants(),
  ]);

  const options: ConsultantOption[] = [
    ...teamMembers.map((member) => ({
      key: `consultant:${member.id}`,
      name: member.name,
      source: "team" as const,
      linkReference: member.linkReference,
    })),
    ...customConsultants.map((consultant) => ({
      key: `consultant:${consultant.id}`,
      name: consultant.name,
      source: "custom" as const,
      linkReference: consultant.linkReference,
    })),
  ];

  return { teamMembers, customConsultants, options };
}

export async function findConsultantByReference(reference: string) {
  await listTeamMembers();
  const normalizedReference = referenceFromLink(reference);
  if (!normalizedReference) throw new Error("Acesse o formulário pelo link individual do consultor.");

  const connection = await openMySqlConnection();
  try {
    const [rows] = await connection.query<ConsultantRow[]>(
      "SELECT Id, nome, Ativo, Tipo, link_referencia FROM consultores_indicacao WHERE Ativo = 1",
    );
    const row = rows.find(
      (item) => referenceFromLink(item.link_referencia) === normalizedReference,
    );
    if (!row) throw new Error("Este link de consultor não existe ou está inativo.");
    return {
      key: `consultant:${Number(row.Id)}`,
      name: row.nome,
      source: row.Tipo === "Time RD" ? "team" as const : "custom" as const,
      linkReference: row.link_referencia,
    };
  } finally {
    await connection.end();
  }
}

export async function addCustomConsultant(rawName: string) {
  const name = normalizeName(rawName);
  if (name.length < 2 || name.length > 100) {
    throw new Error("Informe um nome de consultor entre 2 e 100 caracteres.");
  }

  const teamMembers = await listTeamMembers();
  const duplicatesTeamMember = teamMembers.some((member) => {
    const fullName = normalizeName(member.name);
    const firstName = fullName.split(" ")[0];
    return name === fullName || name === firstName;
  });
  if (duplicatesTeamMember) {
    throw new Error("Esse consultor já faz parte da equipe do RD Station.");
  }

  const linkReference = linkForName(name);
  const connection = await openMySqlConnection();
  try {
    const [existing] = await connection.execute<ConsultantRow[]>(
      "SELECT Id, nome, Ativo, Tipo, link_referencia FROM consultores_indicacao WHERE UPPER(nome) = ? LIMIT 1",
      [name],
    );
    if (existing.length) {
      if (existing[0].Tipo !== "Cadastrado") {
        throw new Error("Esse consultor já faz parte da equipe do RD Station.");
      }
      if (existing[0].Ativo) throw new Error("Esse consultor já está cadastrado.");
      await connection.execute(
        "UPDATE consultores_indicacao SET Ativo = 1, link_referencia = ? WHERE Id = ?",
        [linkReference, existing[0].Id],
      );
      return {
        id: Number(existing[0].Id),
        name,
        active: true,
        type: "Cadastrado" as const,
        linkReference,
      };
    }

    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO consultores_indicacao (nome, Ativo, Tipo, link_referencia) VALUES (?, 1, 'Cadastrado', ?)",
      [name, linkReference],
    );
    return {
      id: result.insertId,
      name,
      active: true,
      type: "Cadastrado" as const,
      linkReference,
    };
  } finally {
    await connection.end();
  }
}

export async function removeCustomConsultant(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("Consultor inválido.");
  }

  const connection = await openMySqlConnection();
  try {
    const [result] = await connection.execute<ResultSetHeader>(
      "UPDATE consultores_indicacao SET Ativo = 0 WHERE Id = ? AND Tipo = 'Cadastrado'",
      [id],
    );
    if (!result.affectedRows) throw new Error("Consultor não encontrado.");
  } finally {
    await connection.end();
  }
}

export async function resolveConsultantSelection(selection: string, reference: string) {
  const match = /^consultant:(\d+)$/.exec(selection);
  if (!match) throw new Error("O link do consultor responsável é inválido.");

  const normalizedReference = referenceFromLink(reference);
  if (!normalizedReference) throw new Error("O link do consultor responsável é inválido.");

  const consultantId = Number(match[1]);
  const teamMembers = await listTeamMembers();
  const connection = await openMySqlConnection();
  try {
    const [rows] = await connection.execute<ConsultantRow[]>(
      "SELECT Id, nome, Ativo, Tipo, link_referencia FROM consultores_indicacao WHERE Id = ? AND Ativo = 1 LIMIT 1",
      [consultantId],
    );
    const consultant = rows[0];
    if (!consultant) throw new Error("O consultor responsável deste link não está ativo.");
    if (referenceFromLink(consultant.link_referencia) !== normalizedReference) {
      throw new Error("O consultor informado não corresponde ao link acessado.");
    }

    if (consultant.Tipo === "Time RD") {
      const teamMember = teamMembers.find(
        (member) => normalizeName(member.name) === normalizeName(consultant.nome),
      );
      if (!teamMember) throw new Error("O consultor não está mais disponível na equipe do RD Station.");
      return { consultantName: consultant.nome, ownerId: teamMember.rdUserId };
    }

    return {
      consultantName: consultant.nome,
      ownerId: randomItem(teamMembers).rdUserId,
    };
  } finally {
    await connection.end();
  }
}
