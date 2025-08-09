# Add Service Workflow

Artists can now publish offerings using a shared **BaseServiceWizard**. The wizard mirrors the musician service modal so every category shares the same layout and navigation. It manages step flow, form submission and client-side media uploads while category wizards supply their own fields. Media uploads now match the musician experience with image-only validation, thumbnail previews and the ability to remove selections before publishing.

## Categories

All service categories share the BaseServiceWizard for a consistent layout and navigation. Seeded categories include:

- **Musician**
- **DJ**
- **Photographer**
- **Videographer**
- **Speaker**
- **Event Service**
- **Wedding Venue**
- **Caterer**
- **Bartender**
- **MC & Host**

Each category adds its own fields; for example, a **Musician** selects a service type such as Live Performance and sets pricing, while a **Photographer** captures camera details and pricing. All wizards submit to the existing `/api/v1/services/` endpoint. Media files are read client-side and sent as base64 strings in the `media_url` field.

The newly added **DJ** wizard records a preferred genre, while the **Event Service** wizard captures a description of the offering. Both reuse the BaseServiceWizard to provide the same navigation and media upload experience as other categories.

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
Provide `service_category_id` only when the service belongs to one of the seeded categories; otherwise omit this field.
