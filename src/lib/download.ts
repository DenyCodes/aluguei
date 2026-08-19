export async function downloadPrivateFile(url: string, fileName: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Não foi possível preparar a cópia do contrato.");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
