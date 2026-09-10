// Marca do Garimpo: losango de três facetas, como pedra lapidada.
//
// É o mesmo desenho do ícone do app (app/src-tauri/icons) — mexeu num, mexe
// no outro, senão a barra de tarefas e a barra de título mostram marcas
// diferentes.
export default function Marca({ tamanho = 18 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M10 1.7 10 18.3 1.7 10z" fill="#0d9488" />
      <path d="M10 1.7 18.3 10 10 10z" fill="#0f766e" />
      <path d="M10 10 18.3 10 10 18.3z" fill="#5eead4" />
    </svg>
  );
}
