/* QuizMario cloud sync settings.
 * Andy: create a free Supabase project, then paste two values from
 * Project Settings → API. The anon key is public (RLS protects each row).
 * Never put the service_role key in this file.
 *
 * SUPABASE_URL      CF reverse proxy for CN reachability (base URL only, no path).
 * SUPABASE_ANON_KEY anon / public key (legacy JWT eyJ… or sb_publishable_…)
 * The value below is the live sb_publishable key. Leave it.
 * A legacy anon JWT is only a fallback if this publishable key is rejected;
 * do not replace the publishable key.
 * SITE_URL          Auth Site URL for this grok-track build. Keep the trailing slash.
 */
window.QUIZMARIO_CONFIG = {
  SUPABASE_URL: "https://quizmario-supabase-proxy.juguang-qm.workers.dev",
  SUPABASE_ANON_KEY: "sb_publishable_wXq1t1Ynsj9o1qGpU5T3IQ_7M5EC1ZK",
  SITE_URL: "https://andywillbeback.github.io/QuizMario/grok/",
};
