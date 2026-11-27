import { useId, useState } from 'react';

// Kolom password dengan tombol Lihat/Sembunyikan di dalamnya (dipakai Login dan Kelola admin).
export default function PasswordField({ name = 'password', label = 'Password', autoComplete, value, onChange }: {
  name?: string; label?: string; autoComplete: string; value?: string; onChange?: (v: string) => void;
}) {
  const id = useId();
  const [show, setShow] = useState(false);
  const ctl = value === undefined ? {} : { value, onChange: (e: { target: { value: string } }) => onChange?.(e.target.value) };
  return (
    <div className="adm-fld">
      <label htmlFor={id}><small>{label}</small></label>
      <div className="adm-fld-row">
        <input id={id} name={name} type={show ? 'text' : 'password'} autoComplete={autoComplete} required {...ctl} />
        <button type="button" className="adm-eye press" aria-pressed={show} aria-controls={id} onClick={() => setShow(!show)}>
          {show ? 'Sembunyikan' : 'Lihat'}
        </button>
      </div>
    </div>
  );
}
