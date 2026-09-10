import logo from "@/assets/reload-media.svg";

export function BrandCredit() {
  return (
    <a
      className="brand-credit"
      href="https://www.reloadmedia.com.au/"
      target="_blank"
      rel="noopener noreferrer"
    >
      <span>Built by</span>
      <img src={logo} alt="Reload Media" width="110" height="43" />
    </a>
  );
}
