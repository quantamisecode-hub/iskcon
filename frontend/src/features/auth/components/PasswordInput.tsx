import { useState } from 'react';

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
}

/** Email, password and a show/hide toggle — no password managers of our own doing. */
export function PasswordInput({ id, ...rest }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        className="w-full rounded-md border border-slate-300 px-3 py-2 pr-16 text-slate-900 focus:border-blue-500 focus:outline-none"
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
