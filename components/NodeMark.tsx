// Marca gráfica da Influência (nós conectados). cor padrão herdada via currentColor
// quando não passada, para funcionar bem sobre fundo amarelo (preto) ou escuro.
export default function NodeMark({ cor = "#F6E003", size = 26 }: { cor?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="5" r="2.4" fill={cor} />
      <circle cx="5.5" cy="16" r="2.4" fill={cor} />
      <circle cx="18.5" cy="16" r="2.4" fill={cor} />
      <path d="M12 6.5 L6.5 14.5 M12 6.5 L17.5 14.5 M7.5 16 L16.5 16" stroke={cor} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
