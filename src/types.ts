export interface Size {
  label: string;
  max: number;
}

export type Sizes = [Size, Size, Size, Size, Size];

export interface ChangeOptions {
  filesToIgnore: string[];
  ignoreLineDeletions: boolean;
  ignoreFileDeletions: boolean;
}

export interface LabelingOptions extends ChangeOptions {
  sizes: Sizes;
  failIfXl: boolean;
  messageIfXl: string;
}

export interface ActionOptions extends LabelingOptions {
  repository: { owner: string; repo: string };
  number: number;
  token: string;
  apiUrl: string;
}

export interface GitHubClient {
  calculateTotalModifications(options: ChangeOptions, maxModifications: number): Promise<number>;
  getLabels(): Promise<string[]>;
  addLabel(label: string): Promise<void>;
  removeLabel(label: string): Promise<void>;
  comment(message: string): Promise<void>;
}
