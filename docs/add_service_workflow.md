# Add Service Workflow

Artists can now publish offerings using a shared **BaseServiceWizard**. The wizard mirrors the musician service modal so every category shares the same layout and navigation. It manages step flow, form submission and client-side media uploads while category wizards supply their own fields. Media uploads now match the musician experience with image-only validation, thumbnail previews and the ability to remove selections before publishing.

> **Visibility note:** Service providers remain hidden from search results and the homepage until they publish at least one service. Adding a service through this workflow makes the profile publicly discoverable.

## Categories

All service categories share the BaseServiceWizard for a consistent layout and navigation. Seeded categories include:

- **Musician**
- **DJ**
- **Photographer**
- **Videographer**
- **Speaker**
- **Sound Service**
- **Wedding Venue**
- **Caterer**
- **Bartender**
- **MC & Host**

Each category is identified by a canonical slug defined in `frontend/src/lib/categoryMap.ts`.
This slug is sent to the backend so services map to the correct providers without relying on database IDs.

Each category adds its own fields; for example, a **Musician** selects a service type such as Live Performance and sets pricing, while a **Photographer** captures camera details and pricing. All wizards submit to the existing `/api/v1/services/` endpoint. Media files are read client-side and sent as base64 strings in the `media_url` field. When a provider chooses a line of work, the wizard includes the selected slug as `service_category_slug` so the API links the new service to the correct backend category.

The newly added **DJ** wizard records a preferred genre, while the **Sound Service** wizard captures a description of the offering. Both reuse the BaseServiceWizard to provide the same navigation and media upload experience as other categories.

```http
POST /api/v1/services/
{
  "title": "My Service",
  "price": 100,
  "service_type": "Live Performance",
  "media_url": "data:image/png;base64,..."
}
```

Additional category details (e.g., `camera_brand`) are included under the `details` object.
Always provide a `service_category_slug` for seeded categories; requests without a category are rejected.
