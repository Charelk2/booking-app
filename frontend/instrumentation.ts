import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';

export function register() {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);
  const provider = new NodeTracerProvider({
    resource: new Resource({ 'service.name': 'booking-frontend' }),
  });
  provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  provider.register();
}
