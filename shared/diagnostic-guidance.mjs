export const REGION_SOURCES = {
  claude: "https://www.anthropic.com/supported-countries",
  gpt: "https://help.openai.com/en/articles/7947663-chatgpt-supported-countries",
};

export const CAPTCHA_SETUP = {
  managed: {
    fields: ["turnstileSiteKey", "turnstileSecret"],
    mode: "Cloudflare Turnstile：Managed（托管）",
    url: "https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/",
  },
  noninteractive: {
    fields: ["turnstileNoninteractiveSiteKey", "turnstileNoninteractiveSecret"],
    mode: "Cloudflare Turnstile：Non-interactive（非交互）",
    url: "https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/",
  },
  recaptcha: {
    fields: ["recaptchaSiteKey", "recaptchaSecret"],
    mode: "Google reCAPTCHA v3：与 siteverify 兼容的站点公钥和 Secret",
    url: "https://developers.google.com/recaptcha/docs/v3",
  },
};

// Return field NAMES only. Never send secrets through the config API.
export function captchaConfiguration(config, kind) {
  const setup = CAPTCHA_SETUP[kind];
  const missingFields = setup.fields.filter((field) => !config[field]);
  return {
    siteKey: config[setup.fields[0]] || null,
    configured: missingFields.length === 0,
    missingFields,
  };
}
