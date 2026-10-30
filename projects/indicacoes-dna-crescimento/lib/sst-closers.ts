import { rdRequest } from "@/lib/rd";
import { type CalendarUser } from "@/lib/google-calendar";

export const SST_CLOSER_TEAM_ID = "679294fc3e41190018178cb4";

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

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function listSstClosers(): Promise<CalendarUser[]> {
  const response = await rdRequest<TeamsResponse>("/teams");
  const team = response.teams?.find(
    (item) => (item.id ?? item._id) === SST_CLOSER_TEAM_ID,
  );
  if (!team) {
    throw new Error("A equipe CLOSER SST não foi encontrada no RD Station.");
  }

  const users = (team.team_users ?? [])
    .map((user) => ({
      id: user.id ?? user._id ?? "",
      name: user.name?.trim() ?? "",
      email: user.email?.trim().toLocaleLowerCase("pt-BR") ?? "",
    }))
    .filter(
      (user) =>
        /^[a-fA-F0-9]{24}$/.test(user.id) &&
        user.name.length > 0 &&
        validEmail(user.email),
    );

  if (!users.length) {
    throw new Error(
      "Nenhum usuário da equipe CLOSER SST possui e-mail válido no RD Station.",
    );
  }
  return users;
}
