export default function Loading() {
  return (
    <div className="bg-white">
      {/* ======= MOBILE ======= */}
      <div className="md:hidden">
        {/* Hero */}
        <div className="relative h-48 w-full overflow-hidden">
          <div className="h-full w-full bg-gray-200 animate-pulse" />
        </div>
        {/* Card */}
        <div className="-mt-10 px-4">
          <div className="relative bg-white/90 rounded-2xl shadow-sm border border-gray-100 p-4 backdrop-blur">
            <div className="flex items-center gap-4">
              <div className="relative -mt-10 h-20 w-20 shrink-0 rounded-full ring-4 ring-white overflow-hidden bg-gray-200 animate-pulse" />
              <div className="min-w-0 flex-1">
                <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse" />
                <div className="mt-2 h-3 bg-gray-200 rounded w-1/3 animate-pulse" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 border border-gray-200 rounded animate-pulse" />
              ))}
            </div>
          </div>
        </div>
        {/* Services grid preview */}
        <div className="px-4 py-4 grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-100 p-2">
              <div className="aspect-[4/3] rounded-lg bg-gray-200 animate-pulse" />
              <div className="mt-2 h-3 bg-gray-200 rounded w-3/4 animate-pulse" />
              <div className="mt-1 h-2 bg-gray-200 rounded w-1/2 animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* ======= DESKTOP ======= */}
      <div className="hidden md:block">
        {/* Use a fixed grid so columns are stable on Safari too */}
        <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-5 bg-white">
          {/* Left rail */}
          <aside className="col-span-2 bg-white p-6">
            <div className="h-48 overflow-hidden rounded-3xl shadow-sm bg-gray-200 animate-pulse" />
            <div className="pt-0 bg-white">
              <div className="flex flex-col items-center text-center">
                <div className="relative -mt-12 h-24 w-24 rounded-full ring-4 ring-white bg-gray-200 animate-pulse" />
                <div className="mt-4 h-6 bg-gray-200 rounded w-40 animate-pulse" />
                <div className="mt-2 h-3 bg-gray-200 rounded w-24 animate-pulse" />
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-6 w-24 rounded-full bg-gray-100 border border-gray-200 animate-pulse" />
                  ))}
                </div>
              </div>
              {/* Sticky Action Dock placeholder */}
              <div className="mt-6">
                <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse" />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="h-9 rounded-xl bg-gray-200 animate-pulse" />
                    <div className="h-9 rounded-xl bg-gray-100 border border-gray-200 animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Right rail */}
          <section className="col-span-3 p-6 space-y-6">
            {/* Services list skeleton (matches card layout) */}
            <div className="space-y-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl bg-white">
                  <div className="flex gap-4">
                    <div className="relative h-32 w-32 rounded-3xl overflow-hidden bg-gray-200 animate-pulse shrink-0" />
                    <div className="flex-1 py-1">
                      <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse" />
                      <div className="mt-2 h-3 bg-gray-200 rounded w-1/3 animate-pulse" />
                      <div className="mt-3 space-y-2">
                        <div className="h-2 bg-gray-200 rounded w-full animate-pulse" />
                        <div className="h-2 bg-gray-200 rounded w-5/6 animate-pulse" />
                        <div className="h-2 bg-gray-200 rounded w-3/4 animate-pulse" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="mt-8 h-px w-full bg-gray-200" />

            {/* About section skeleton */}
            <div>
              <div className="h-6 bg-gray-200 rounded w-24 animate-pulse" />
              <div className="mt-3 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-full animate-pulse" />
                <div className="h-3 bg-gray-200 rounded w-11/12 animate-pulse" />
                <div className="h-3 bg-gray-200 rounded w-10/12 animate-pulse" />
              </div>
            </div>

            {/* Gallery skeleton */}
            <div>
              <div className="h-6 bg-gray-200 rounded w-28 animate-pulse" />
              <div className="mt-3 grid grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-lg bg-gray-200 animate-pulse" />
                ))}
              </div>
            </div>

            {/* Reviews summary skeleton */}
            <div>
              <div className="h-6 bg-gray-200 rounded w-40 animate-pulse" />
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
                    <div className="flex-1 h-2 bg-gray-200 rounded animate-pulse" />
                    <div className="h-3 w-8 bg-gray-200 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
