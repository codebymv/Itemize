import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, ChevronRight, X, Lightbulb } from 'lucide-react';
import { Label } from '@/components/ui/label';

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
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const totalSteps = content.steps.length;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    setCurrentStep(prev => Math.max(0, prev - 1));
  };

  const handleComplete = () => {
    if (dontShowAgain) {
      onDismiss();
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    if (dontShowAgain) {
      onDismiss();
    } else {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' && !isLastStep) {
      handleNext();
    } else if (e.key === 'ArrowLeft' && !isFirstStep) {
      handlePrevious();
    } else if (e.key === 'Escape') {
      handleSkip();
    }
  };

  const currentStepContent = content.steps[currentStep];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleSkip()}>
      <DialogContent 
        className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="text-2xl font-bold">
                {currentStepContent.title}
              </DialogTitle>
              <DialogDescription className="mt-2">
                {currentStepContent.description}
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleSkip}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </DialogHeader>

        <div className="py-6">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {content.steps.map((_, index) => (
              <div
                key={index}
                className={`h-2 rounded-full transition-all ${
                  index === currentStep
                    ? 'w-8 bg-primary'
                    : index < currentStep
                    ? 'w-2 bg-primary/50'
                    : 'w-2 bg-muted'
                }`}
              />
            ))}
          </div>

          {/* Step content */}
          <div className="space-y-4">
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
                <div className="p-4 rounded-full bg-primary/10">
                  {currentStepContent.icon}
                </div>
              </div>
            )}

            {currentStepContent.tips && currentStepContent.tips.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Lightbulb className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm text-blue-900 dark:text-blue-100 mb-2">
                      Quick Tips
                    </h4>
                    <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
                      {currentStepContent.tips.map((tip, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-blue-600 dark:text-blue-400 mt-0.5">•</span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-col gap-3">
          {/* Don't show again checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="dont-show"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
            />
            <Label
              htmlFor="dont-show"
              className="text-sm font-normal cursor-pointer"
            >
              Don't show this again
            </Label>
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between w-full gap-2">
            <Button
              variant="outline"
              onClick={handleSkip}
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
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}

              <Button
                onClick={handleNext}
                className="min-w-[120px]"
              >
                {isLastStep ? 'Get Started' : 'Next'}
                {!isLastStep && <ChevronRight className="h-4 w-4 ml-1" />}
              </Button>
            </div>
          </div>

          {/* Step counter */}
          <div className="text-center text-sm text-muted-foreground">
            Step {currentStep + 1} of {totalSteps}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
