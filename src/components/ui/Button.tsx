import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'default' | 'lg'
}

export function Button({ className, variant = 'default', size = 'default', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50 disabled:pointer-events-none",
        {
          'bg-blue-600 text-white hover:bg-blue-700 shadow-sm': variant === 'default',
          'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-sm': variant === 'outline',
          'hover:bg-slate-100 text-slate-700': variant === 'ghost',
          'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100': variant === 'danger',
          'h-9 px-3 text-sm': size === 'sm',
          'h-10 py-2 px-4': size === 'default',
          'h-11 px-8 text-lg': size === 'lg',
        },
        className
      )}
      {...props}
    />
  )
}
