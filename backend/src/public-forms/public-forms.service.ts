import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  PublicFormValidationError,
  validateFormDefinition,
  validatePublicFormSubmission,
} from './public-form-contract';
import {
  PublicFormsRepository,
  SubmitVisitContext,
} from './public-forms.repository';

const formNotFound = () =>
  new NotFoundException({
    success: false,
    error: { message: 'Form not found', code: 'NOT_FOUND' },
  });

const serverFailure = (message: string) =>
  new InternalServerErrorException({
    success: false,
    error: { message, code: 'ERROR' },
  });

const contractError = (error: PublicFormValidationError): HttpException => {
  const body: {
    success: false;
    error: { message: string; code: string; details?: { field_id: string } };
  } = {
    success: false,
    error: { message: error.message, code: error.code },
  };
  if (error.fieldId !== null) {
    body.error.details = { field_id: String(error.fieldId) };
  }
  return new HttpException(body, 400);
};

@Injectable()
export class PublicFormsService {
  private readonly logger = new Logger(PublicFormsService.name);

  constructor(private readonly repository: PublicFormsRepository) {}

  async getPublicForm(identifier: string) {
    let data;
    try {
      data = await this.repository.publicForm(identifier);
      if (data) validateFormDefinition(data.fields);
    } catch (error) {
      if (error instanceof PublicFormValidationError) {
        throw contractError(error);
      }
      this.logger.error(
        `Error fetching public form: ${(error as Error).message}`,
      );
      throw serverFailure('Failed to load form');
    }
    if (!data) throw formNotFound();
    return { success: true, data: { ...data.form, fields: data.fields } };
  }

  async submitPublicForm(
    identifier: string,
    body: { data?: unknown },
    context: SubmitVisitContext,
  ) {
    let outcome;
    try {
      outcome = await this.repository.submitPublicForm(
        identifier,
        context,
        (fields) => validatePublicFormSubmission(fields, body?.data),
      );
    } catch (error) {
      if (error instanceof PublicFormValidationError) {
        throw contractError(error);
      }
      this.logger.error(`Error submitting form: ${(error as Error).message}`);
      throw serverFailure('Failed to submit form');
    }
    if (outcome.status === 'not_found') throw formNotFound();
    return {
      success: true,
      data: {
        success: true,
        message: outcome.form.success_message,
        redirect_url: outcome.form.redirect_url,
      },
    };
  }
}
