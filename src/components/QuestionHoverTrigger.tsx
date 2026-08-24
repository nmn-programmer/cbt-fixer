import React from 'react';
import { QuestionData } from '../types/cbt';
import { useQuestionPreviewStore, QuestionPreviewMeta } from '../store/useQuestionPreviewStore';

interface QuestionHoverTriggerProps {
  question: QuestionData;
  subjectName?: string;
  sectionName?: string;
  archiveId?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  showHoverHint?: boolean;
  inline?: boolean;
  as?: keyof React.ReactHTML | 'div' | 'span';
}

export const QuestionHoverTrigger: React.FC<QuestionHoverTriggerProps> = ({
  question,
  subjectName,
  sectionName,
  archiveId,
  children,
  className = '',
  style,
  onClick,
  showHoverHint = false,
  inline = false,
  as,
}) => {
  const { schedulePreview, scheduleHide, cancelScheduledPreview } = useQuestionPreviewStore();

  if (!question) return <>{children}</>;

  const Component = as || (inline ? 'span' : 'div');

  const meta: QuestionPreviewMeta = {
    subjectName,
    sectionName,
    archiveId,
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    schedulePreview(
      question,
      meta,
      {
        clientX: e.clientX,
        clientY: e.clientY,
        rect,
      },
      100 // 0.1s exact delay as requested!
    );
  };

  const handleMouseLeave = () => {
    cancelScheduledPreview();
    scheduleHide(250);
  };

  return (
    <Component
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      style={style}
      className={`group/qhover ${inline ? 'inline-flex items-center' : ''} ${className}`}
      title={showHoverHint ? `Hover to preview Q${question.que} images` : undefined}
    >
      {children}
    </Component>
  );
};
