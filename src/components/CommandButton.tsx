import type { FC, ReactNode, CSSProperties } from 'react'

interface Props {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
  style?: CSSProperties
}

const CommandButton: FC<Props> = ({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  type = 'button',
  style
}) => {
  return (
    <>
      <button
        type={type}
        className={`command-btn command-btn--${variant} command-btn--${size} ${className}`}
        onClick={onClick}
        disabled={disabled}
        style={style}
      >
        <span className="command-btn__content">{children}</span>
      </button>
      <style>{`
        .command-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: var(--s2, #101510);
          color: var(--text-primary, #E8EFE9);
          font-family: var(--mono-font, 'Space Mono', monospace);
          text-transform: uppercase;
          letter-spacing: 0.12em;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          overflow: visible;
        }

        .command-btn::before,
        .command-btn::after {
          content: '';
          position: absolute;
          width: 8px;
          height: 8px;
          border: 2px solid transparent;
          transition: all 0.2s ease;
        }

        .command-btn::before {
          top: -2px;
          left: -2px;
          border-top-color: inherit;
          border-left-color: inherit;
        }

        .command-btn::after {
          bottom: -2px;
          right: -2px;
          border-bottom-color: inherit;
          border-right-color: inherit;
        }

        .command-btn:hover:not(:disabled) {
          transform: scale(1.02);
        }

        .command-btn:active:not(:disabled) {
          transform: scale(0.98);
        }

        .command-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          pointer-events: none;
        }

        /* Variants */
        .command-btn--primary {
          border: 1px solid var(--emerald-dim, #1FAF5A);
          border-top-color: var(--emerald-dim, #1FAF5A);
          border-left-color: var(--emerald-dim, #1FAF5A);
          border-bottom-color: var(--emerald-dim, #1FAF5A);
          border-right-color: var(--emerald-dim, #1FAF5A);
          box-shadow: 0 0 10px rgba(43, 224, 102, 0.1);
        }
        
        .command-btn--primary:hover:not(:disabled) {
          border-color: var(--emerald-bright, #39F27A);
          box-shadow: 0 0 15px rgba(43, 224, 102, 0.4);
          text-shadow: 0 0 8px rgba(43, 224, 102, 0.6);
        }
        .command-btn--primary::before, .command-btn--primary::after {
           border-color: var(--emerald, #2BE066);
        }

        .command-btn--secondary {
          border: 1px solid var(--bronze, #8A6238);
          box-shadow: 0 0 10px rgba(138, 98, 56, 0.1);
        }
        
        .command-btn--secondary:hover:not(:disabled) {
          border-color: var(--bronze-light, #A77B45);
          box-shadow: 0 0 15px rgba(167, 123, 69, 0.4);
          text-shadow: 0 0 8px rgba(167, 123, 69, 0.6);
        }
        .command-btn--secondary::before, .command-btn--secondary::after {
           border-color: var(--bronze, #8A6238);
        }

        .command-btn--danger {
          border: 1px solid var(--danger-dim, #8F2020);
          box-shadow: 0 0 10px rgba(199, 58, 50, 0.1);
        }
        
        .command-btn--danger:hover:not(:disabled) {
          border-color: var(--danger, #C73A32);
          box-shadow: 0 0 15px rgba(199, 58, 50, 0.4);
          text-shadow: 0 0 8px rgba(199, 58, 50, 0.6);
        }
        .command-btn--danger::before, .command-btn--danger::after {
           border-color: var(--danger, #C73A32);
        }

        .command-btn--ghost {
          background: transparent;
          border: 1px solid var(--text-muted, #66736A);
        }
        
        .command-btn--ghost:hover:not(:disabled) {
          border-color: var(--text-secondary, #AAB8AE);
          background: rgba(255, 255, 255, 0.05);
        }
        .command-btn--ghost::before, .command-btn--ghost::after {
           border-color: var(--text-muted, #66736A);
        }

        /* Sizes */
        .command-btn--sm {
          padding: 6px 12px;
          font-size: 0.75rem;
        }

        .command-btn--md {
          padding: 10px 20px;
          font-size: 0.875rem;
        }

        .command-btn--lg {
          padding: 14px 28px;
          font-size: 1rem;
        }
        
        .command-btn__content {
          position: relative;
          z-index: 1;
        }
      `}</style>
    </>
  )
}

export default CommandButton
