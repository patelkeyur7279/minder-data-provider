export abstract class BaseModel {
  public id?: string | number;
  public createdAt?: Date;
  public updatedAt?: Date;

  constructor(data?: any) {
    if (data) {
      this.fromJSON(data);
    }
  }

  // Transform JSON data to model instance
  public fromJSON(data: any): this {
    Object.keys(data).forEach(key => {
      if (data[key] !== undefined) {
        // Handle date fields
        if ((key === 'createdAt' || key === 'updatedAt') && typeof data[key] === 'string') {
          (this as any)[key] = new Date(data[key]);
        } else {
          (this as any)[key] = data[key];
        }
      }
    });
    return this;
  }

  // Transform model instance to JSON
  public toJSON(): any {
    const json: any = {};
    Object.keys(this).forEach(key => {
      const value = (this as any)[key];
      if (value !== undefined) {
        // Handle date fields
        if (value instanceof Date) {
          json[key] = value.toISOString();
        } else if (typeof value !== 'function') {
          json[key] = value;
        }
      }
    });
    return json;
  }

  // Validate model data
  public validate(): { isValid: boolean; errors: string[] } {
    return { isValid: true, errors: [] };
  }

  // Clone the model
  public clone(): this {
    const Constructor = this.constructor as new () => this;
    return new Constructor().fromJSON(this.toJSON());
  }

  // Check equality with another model
  public equals(other: BaseModel): boolean {
    if (!other || this.constructor !== other.constructor) {
      return false;
    }
    return JSON.stringify(this.toJSON()) === JSON.stringify(other.toJSON());
  }

  // Get display name (override in subclasses)
  public getDisplayName(): string {
    return this.id?.toString() || 'Unknown';
  }

  // Check if model is new (no id)
  public isNew(): boolean {
    return !this.id;
  }

  // Check if model is persisted (has id)
  public isPersisted(): boolean {
    return !!this.id;
  }

  // Get model type name
  public getTypeName(): string {
    return this.constructor.name;
  }

  // Merge data into current model
  public merge(data: Partial<this>): this {
    Object.keys(data).forEach(key => {
      if (data[key as keyof this] !== undefined) {
        (this as any)[key] = data[key as keyof this];
      }
    });
    return this;
  }

  // Reset model to initial state
  public reset(): this {
    Object.keys(this).forEach(key => {
      if (key !== 'id') {
        delete (this as any)[key];
      }
    });
    return this;
  }

  // Get changed fields compared to another model
  public getChangedFields(other: BaseModel): string[] {
    const changes: string[] = [];
    const thisData = this.toJSON();
    const otherData = other.toJSON();

    Object.keys(thisData).forEach(key => {
      if (thisData[key] !== otherData[key]) {
        changes.push(key);
      }
    });

    return changes;
  }

  // Check if model has changes compared to another model
  public hasChanges(other: BaseModel): boolean {
    return this.getChangedFields(other).length > 0;
  }
}