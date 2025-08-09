# Add Service Workflow

Artists can now publish offerings using a shared **BaseServiceWizard**. The wizard mirrors the musician service modal so every category shares the same layout and navigation. It manages step flow, form submission and client-side media uploads while category wizards supply their own fields. Media uploads now match the musician experience with image-only validation, thumbnail previews and the ability to remove selections before publishing.

## Categories

- **Musician** – selects a service type such as Live Performance and sets pricing.
- **Photographer** – captures camera details and pricing.

Both wizards submit to the existing `/api/v1/services/` endpoint. Media files are read client-side and sent as base64 strings in the `media_url` field.

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
