import { SVGProps } from "react";

export function MtnLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect width="40" height="40" rx="8" fill="#FFD600" />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill="#003366" fontWeight="900" fontSize="16" fontFamily="system-ui">
        MTN
      </text>
    </svg>
  );
}

export function AirtelTigoLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect width="40" height="40" rx="8" fill="#0057B8" />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill="white" fontWeight="900" fontSize="11" fontFamily="system-ui">
        Airtel
      </text>
    </svg>
  );
}

export function TelecelLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect width="40" height="40" rx="8" fill="#E30613" />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill="white" fontWeight="900" fontSize="13" fontFamily="system-ui">
        Telecel
      </text>
    </svg>
  );
}
