import React, { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { ModalBody, ModalContent, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';

export interface OnboardingStep {
  title: string;
  description: string;
  image?: string;
  tips?: string[];
  icon?: React.ReactNode;
}

export interface OnboardingContent {
  title: string;
  description: string;
  steps: OnboardingStep[];
  version: string;
  completeLabel?: string;
}

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  onDismiss: () => void;
  content: OnboardingContent;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onComplete,
  onDismiss,
  content,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  const totalSteps = content.steps.length;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    setCurrentStep(prev => Math.max(0, prev - 1));
  };

  const handleClose = () => {
    onClose();
  };

  const handleDismiss = () => {
    onDismiss();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' && !isLastStep) {
      handleNext();
    } else if (e.key === 'ArrowLeft' && !isFirstStep) {
      handlePrevious();
    } else if (e.key === 'Escape') {
      handleClose();
    }
  };

  const currentStepContent = content.steps[currentStep];

  // Radix can keep exit-animation content mounted after a controlled dialog
  // closes. Unmounting here guarantees the tour cannot remain visible or
  // intercept pointer events after Close, Escape, or Skip Tour.
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <ModalContent
        size="lg"
        onKeyDown={handleKeyDown}
      >
        <ModalHeader
          title={currentStepContent.title}
          description={currentStepContent.description}
        />

        <ModalBody className="py-4 sm:py-6">
{/* Step indicator */}
          <div className="flex items-center justify-center gap-1.5 sm:gap-2 mb-4 sm:mb-6">
            {content.steps.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 sm:h-2 rounded-full transition-all ${
                  index === currentStep
                    ? 'w-6 sm:w-8 bg-primary'
                    : index < currentStep
                    ? 'w-1.5 sm:w-2 bg-primary/50'
                    : 'w-1.5 sm:w-2 bg-muted'
                }`}
              />
            ))}
          </div>

          {/* Step content */}
          <div className="space-y-3 sm:space-y-4">
            {currentStepContent.image && (
              <div className="rounded-lg overflow-hidden border bg-muted/10">
                <img
                  src={currentStepContent.image}
                  alt={currentStepContent.title}
                  className="w-full h-auto"
                />
              </div>
            )}

{currentStepContent.icon && (
              <div className="flex justify-center">
                <div className="p-3 sm:p-4 rounded-full bg-primary/10">
                  <div className="[&>svg]:h-8 [&>svg]:w-8 sm:[&>svg]:h-12 sm:[&>svg]:w-12">
                    {currentStepContent.icon}
                  </div>
                </div>
              </div>
            )}

{currentStepContent.tips && currentStepContent.tips.length > 0 && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 sm:p-4">
                <div className="flex items-start gap-2 sm:gap-3">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-xs sm:text-sm text-foreground mb-1.5 sm:mb-2">
                      Quick Tips
                    </h4>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-1.5 text-xs sm:text-sm text-muted-foreground">
                      {currentStepContent.tips.map((tip, index) => (
                        <li key={index} className="flex items-start gap-1.5">
                          <span className="mt-0.5 text-primary" aria-hidden="true">&bull;</span>
                          <span className="leading-tight">{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ModalBody>

        <ModalFooter className="flex-col gap-2 sm:flex-col sm:gap-3">
          {/* Navigation buttons */}
          <div className="flex items-center justify-between w-full gap-2">
            <Button
              variant="outline"
              onClick={handleDismiss}
              size="sm"
              className="text-xs sm:text-sm"
            >
              Skip Tour
            </Button>

            <div className="flex items-center gap-2">
              {!isFirstStep && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handlePrevious}
                  title="Previous (←)"
                  className="h-8 w-8 sm:h-9 sm:w-9"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}

<Button
                onClick={handleNext}
                size="sm"
                className="min-w-[100px] text-xs sm:min-w-[120px] sm:text-sm"
              >
                {isLastStep ? (content.completeLabel ?? 'Get Started') : 'Next'}
                {!isLastStep && <ChevronRight className="h-4 w-4 ml-1" />}
              </Button>
            </div>
          </div>

          {/* Step counter */}
          <div className="text-center text-xs sm:text-sm text-muted-foreground">
            Step {currentStep + 1} of {totalSteps}
          </div>
        </ModalFooter>
      </ModalContent>
    </Dialog>
  );
};
