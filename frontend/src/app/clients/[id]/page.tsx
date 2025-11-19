import ClientProfilePanel from '@/components/chat/MessageThread/ClientProfilePanel';

export default async function ClientProfilePage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Client not found</h1>
        <p className="text-sm text-gray-600">The client profile you’re looking for does not exist.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="sr-only">Client profile</h1>
      <ClientProfilePanel
        clientId={id}
        clientName={undefined}
        clientAvatarUrl={null}
        providerName={undefined}
        bookingRequestId={0}
        canReview={false}
        isOpen={true}
        autoOpenReview={false}
        onClose={() => {}}
      />
    </main>
  );
}
