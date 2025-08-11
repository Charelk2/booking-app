export function statusChipClass(status: string): string {
  const s = (status || "").toLowerCase();
  if (s.includes("cancelled") || s.includes("declined") || s.includes("rejected") || s.includes("withdrawn")) {
    return "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200";
  }
  if (s.includes("confirmed") || s.includes("completed") || s.includes("accepted")) {
    return "bg-green-50 text-green-700 ring-1 ring-inset ring-green-200";
  }
  if (s.includes("quote")) {
    return "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200";
  }
  if (s.includes("pending")) {
    return "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200";
  }
  return "bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200";
}

