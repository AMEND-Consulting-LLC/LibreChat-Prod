import { forwardRef, ReactNode, Ref } from 'react';
import {
  OGDialogTitle,
  OGDialogClose,
  OGDialogFooter,
  OGDialogHeader,
  OGDialogContent,
  OGDialogDescription,
} from './OriginalDialog';
import { useLocalize } from '~/hooks';
import { Button } from './Button';
import { Spinner } from '~/svgs';
import { cn } from '~/utils/';

type SelectionProps = {
  selectHandler?: () => void;
  selectClasses?: string;
  selectText?: string | ReactNode;
  isLoading?: boolean;
};

type DialogTemplateProps = {
  title: string;
  description?: string;
  main?: ReactNode;
  buttons?: ReactNode;
  leftButtons?: ReactNode;
  selection?: SelectionProps;
  className?: string;
  overlayClassName?: string;
  headerClassName?: string;
  mainClassName?: string;
  footerClassName?: string;
  showCloseButton?: boolean;
  showCancelButton?: boolean;
  onClose?: () => void;
};

const OGDialogTemplate = forwardRef((props: DialogTemplateProps, ref: Ref<HTMLDivElement>) => {
  const localize = useLocalize();
  const {
    title,
    main,
    buttons,
    selection,
    className,
    leftButtons,
    description = '',
    mainClassName,
    headerClassName,
    footerClassName,
    showCloseButton,
    overlayClassName,
    showCancelButton = true,
  } = props;
  const { selectHandler, selectClasses, selectText, isLoading } = selection || {};

  const defaultSelect =
    'bg-gray-800 text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-200 dark:text-gray-800 dark:hover:bg-gray-200';
  return (
    <OGDialogContent
      overlayClassName={overlayClassName}
      showCloseButton={showCloseButton}
      ref={ref}
      className={cn('w-11/12 border-none bg-background text-foreground', className ?? '')}
      onClick={(e) => e.stopPropagation()}
    >
      <OGDialogHeader className={cn(headerClassName ?? '')}>
        <OGDialogTitle>{title}</OGDialogTitle>
        {description && (
          <OGDialogDescription className="items-center justify-center">
            {description}
          </OGDialogDescription>
        )}
      </OGDialogHeader>
      <div className={cn('px-0 py-2', mainClassName)}>{main != null ? main : null}</div>
      <OGDialogFooter className={footerClassName}>
        <div>
          {leftButtons != null ? (
            <div className="mt-3 flex h-auto gap-3 max-sm:w-full max-sm:flex-col sm:mt-0 sm:flex-row">
              {leftButtons}
            </div>
          ) : null}
        </div>
        <div className="flex h-auto gap-3 max-sm:w-full max-sm:flex-col sm:flex-row">
          {showCancelButton && (
            <OGDialogClose asChild>
              <Button variant="outline">{localize('com_ui_cancel')}</Button>
            </OGDialogClose>
          )}
          {buttons != null ? buttons : null}
          {selection ? (
            <OGDialogClose
              onClick={selectHandler}
              disabled={isLoading}
              className={`${
                selectClasses ?? defaultSelect
              } flex h-10 items-center justify-center rounded-lg border-none px-4 py-2 text-sm disabled:opacity-80 max-sm:order-first max-sm:w-full sm:order-none`}
            >
              {isLoading === true ? (
                <Spinner className="size-4 text-white" />
              ) : (
                (selectText as React.JSX.Element)
              )}
            </OGDialogClose>
          ) : null}
        </div>
      </OGDialogFooter>
    </OGDialogContent>
  );
});

export default OGDialogTemplate;
