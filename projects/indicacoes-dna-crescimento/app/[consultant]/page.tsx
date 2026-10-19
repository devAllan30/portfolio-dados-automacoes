import Home from "../page";

export default async function ConsultantFormPage({
  params,
}: {
  params: Promise<{ consultant: string }>;
}) {
  const { consultant } = await params;
  return <Home consultantReference={consultant} />;
}
