import { ShieldCheck } from "lucide-react";

export default function Mascot({ className = "" }: { className?: string }) {
  return (
    <div className={`mascot ${className}`} role="img" aria-label="抱着薄荷色盾牌的签约守护小猫">
      <span className="kitten-tail" />
      <span className="kitten-body" />
      <span className="kitten-ear left" />
      <span className="kitten-ear right" />
      <span className="kitten-face">
        <span className="kitten-eye left" />
        <span className="kitten-eye right" />
        <span className="kitten-blush left" />
        <span className="kitten-blush right" />
        <span className="kitten-nose" />
        <span className="kitten-smile" />
      </span>
      <span className="kitten-shield"><ShieldCheck /></span>
      <span className="kitten-paw left" />
      <span className="kitten-paw right" />
    </div>
  );
}
