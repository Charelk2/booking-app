-- Normalize portfolio image URLs inside service_provider_profiles JSON fields.
-- 1) Ensure absolute API URLs that point to mounts include /static
-- 2) Optionally normalize upper-case extensions to lower-case

-- Fix missing /static for absolute URLs pointing at known mounts
UPDATE service_provider_profiles
SET portfolio_image_urls = REPLACE(
  portfolio_image_urls,
  'https://api.booka.co.za/portfolio_images/',
  'https://api.booka.co.za/static/portfolio_images/'
)
WHERE portfolio_image_urls LIKE '%https://api.booka.co.za/portfolio_images/%';

UPDATE service_provider_profiles
SET portfolio_urls = REPLACE(
  portfolio_urls,
  'https://api.booka.co.za/portfolio_images/',
  'https://api.booka.co.za/static/portfolio_images/'
)
WHERE portfolio_urls LIKE '%https://api.booka.co.za/portfolio_images/%';

-- Normalize upper-case image extensions to lower-case (PNG/JPG/JPEG)
UPDATE service_provider_profiles
SET portfolio_image_urls = REPLACE(REPLACE(REPLACE(portfolio_image_urls, '.PNG', '.png'), '.JPG', '.jpg'), '.JPEG', '.jpeg')
WHERE portfolio_image_urls LIKE '%.PNG%' OR portfolio_image_urls LIKE '%.JPG%' OR portfolio_image_urls LIKE '%.JPEG%';

UPDATE service_provider_profiles
SET portfolio_urls = REPLACE(REPLACE(REPLACE(portfolio_urls, '.PNG', '.png'), '.JPG', '.jpg'), '.JPEG', '.jpeg')
WHERE portfolio_urls LIKE '%.PNG%' OR portfolio_urls LIKE '%.JPG%' OR portfolio_urls LIKE '%.JPEG%';

-- Report potential remaining offenders (for manual inspection)
-- SELECT user_id, portfolio_image_urls FROM service_provider_profiles WHERE portfolio_image_urls LIKE '%https://api.booka.co.za/portfolio_images/%';
-- SELECT user_id, portfolio_urls FROM service_provider_profiles WHERE portfolio_urls LIKE '%https://api.booka.co.za/portfolio_images/%';

