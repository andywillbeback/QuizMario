/* QuizMario cloud sync settings.
 * Andy: create a free Supabase project, then paste two values from
 * Project Settings → API. The anon key is public (RLS protects each row).
 * Never put the service_role key in this file.
 *
 * SUPABASE_URL      Project URL, like https://xxxxxxxx.supabase.co
 * SUPABASE_ANON_KEY anon / public key (legacy JWT eyJ… or sb_publishable_…)
 * SITE_URL          Auth Site URL. Keep the trailing slash.
 */
window.QUIZMARIO_CONFIG = {
  SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",
  SITE_URL: "https://andywillbeback.github.io/QuizMario/",
};
