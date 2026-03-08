interface CardFieldProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

function CardField({ label, value, mono }: CardFieldProps) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[11px] text-foreground/45">{label}</span>
      <span className={`text-[12px] text-foreground/80 text-right max-w-[60%] truncate ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

interface MobileDataCardProps {
  header: React.ReactNode;
  fields: CardFieldProps[];
  actions?: React.ReactNode;
}

export function MobileDataCard({ header, fields, actions }: MobileDataCardProps) {
  return (
    <div className="rounded-xl border border-border/25 p-3.5" style={{
      background: "linear-gradient(135deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.01) 100%)",
    }}>
      <div className="mb-2 pb-2 border-b border-border/15">{header}</div>
      <div className="divide-y divide-border/8">
        {fields.map((f, i) => <CardField key={i} {...f} />)}
      </div>
      {actions && <div className="mt-2.5 pt-2 border-t border-border/15">{actions}</div>}
    </div>
  );
}
