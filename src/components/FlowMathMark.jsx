export default function FlowMathMark({ className = '', title = '' }) {
  const accessibilityProps = title
    ? { role: 'img', 'aria-label': title }
    : { 'aria-hidden': true };

  return (
    <svg
      {...accessibilityProps}
      className={className}
      focusable="false"
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#0f1715" stroke="#2a6e68" />
      <path
        d="M8 7.5h16l-3.2 4.2h-7.7v3.55h6.15l-3.05 4H13.1v5.25H8V7.5Z"
        fill="#58e0d7"
      />
      <path d="M19.45 7.5H24l-3.2 4.2h-4.55l3.2-4.2Z" fill="#f1b434" />
    </svg>
  );
}
