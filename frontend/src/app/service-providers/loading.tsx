export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="h-6 w-1/3 bg-gray-200 rounded animate-pulse mb-4" />
      <div className="flex flex-wrap gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="w-40">
            <div className="aspect-[4/4] rounded-xl bg-gray-200 animate-pulse" />
            <div className="mt-2 h-3 bg-gray-200 rounded w-3/4 animate-pulse" />
            <div className="mt-1 h-2 bg-gray-200 rounded w-1/2 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

