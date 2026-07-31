type SocialLink = {
  name: string;
  href: string;
  icon: (props: { className?: string }) => React.ReactElement;
};

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M16.5 0h-3.2v16.2a2.8 2.8 0 1 1-2.8-2.8c.2 0 .4 0 .6.1v-3.3a6 6 0 1 0 5.4 6V7.9a7.3 7.3 0 0 0 4.3 1.4V6a4.3 4.3 0 0 1-4.3-4.3V0Z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2Zm0 1.5A4.25 4.25 0 0 0 3.5 7.75v8.5a4.25 4.25 0 0 0 4.25 4.25h8.5a4.25 4.25 0 0 0 4.25-4.25v-8.5A4.25 4.25 0 0 0 16.25 3.5h-8.5Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"
      />
      <path d="M17.25 5.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z" />
    </svg>
  );
}

export const socialLinks: SocialLink[] = [
  {
    name: "Instagram",
    href: "https://www.instagram.com/pangospodar_?igsh=cmswZXVhMm03dWdq",
    icon: InstagramIcon,
  },
  {
    name: "TikTok",
    href: "https://www.tiktok.com/@pangospodar1?_r=1&_t=ZS-98NnpI2BSO9",
    icon: TikTokIcon,
  },
];

/**
 * Social profile links.
 * `variant="dark"` suits the graphite footer, `variant="light"` the white pages.
 */
export default function SocialLinks({
  variant = "dark",
}: {
  variant?: "dark" | "light";
}) {
  const itemClass =
    variant === "dark"
      ? "border-stone-700 bg-stone-900 text-stone-300 hover:border-accent-500 hover:bg-accent-500 hover:text-white"
      : "border-stone-200 bg-white text-stone-700 hover:border-accent-500 hover:bg-accent-500 hover:text-white";

  return (
    <ul className="flex items-center gap-3">
      {socialLinks.map((social) => {
        const Icon = social.icon;
        return (
          <li key={social.name}>
            <a
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${social.name} — ПанГосподар`}
              title={social.name}
              className={`flex h-10 w-10 items-center justify-center rounded-sm border transition-colors ${itemClass}`}
            >
              <Icon className="h-5 w-5" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
