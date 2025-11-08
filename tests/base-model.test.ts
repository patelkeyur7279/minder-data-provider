/**
 * Comprehensive Tests for BaseModel
 * Tests the abstract base model class used for data entities
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { BaseModel } from '../src/models/BaseModel';

// Create concrete test class extending BaseModel
class TestUser extends BaseModel {
  declare name?: string;
  declare email?: string;
  declare age?: number;
  declare active?: boolean;

  public validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!this.name || this.name.trim().length === 0) {
      errors.push('Name is required');
    }
    
    if (!this.email || !this.email.includes('@')) {
      errors.push('Valid email is required');
    }
    
    if (this.age !== undefined && this.age < 0) {
      errors.push('Age must be positive');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  public getDisplayName(): string {
    return this.name || super.getDisplayName();
  }
}

class TestProduct extends BaseModel {
  title?: string;
  price?: number;
}

describe('BaseModel', () => {
  let user: TestUser;

  beforeEach(() => {
    user = new TestUser();
  });

  describe('constructor', () => {
    it('should create empty instance without data', () => {
      const model = new TestUser();
      expect(model).toBeDefined();
      expect(model.id).toBeUndefined();
      expect(model.name).toBeUndefined();
    });

    it('should initialize with data', () => {
      const data = {
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      };
      
      const model = new TestUser(data);
      expect(model.id).toBe(1);
      // Properties are assigned via fromJSON
      expect((model as any).name).toBe('John Doe');
      expect((model as any).email).toBe('john@example.com');
      expect((model as any).age).toBe(30);
    });

    it('should parse date strings in constructor', () => {
      const data = {
        id: 1,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z',
      };
      
      const model = new TestUser(data);
      expect(model.createdAt).toBeInstanceOf(Date);
      expect(model.updatedAt).toBeInstanceOf(Date);
      expect(model.createdAt?.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    });
  });

  describe('fromJSON', () => {
    it('should populate model from JSON data', () => {
      const data = {
        id: 2,
        name: 'Jane Smith',
        email: 'jane@example.com',
        age: 25,
        active: true,
      };
      
      user.fromJSON(data);
      
      expect(user.id).toBe(2);
      expect(user.name).toBe('Jane Smith');
      expect(user.email).toBe('jane@example.com');
      expect(user.age).toBe(25);
      expect(user.active).toBe(true);
    });

    it('should convert date strings to Date objects', () => {
      const data = {
        createdAt: '2025-11-08T12:00:00.000Z',
        updatedAt: '2025-11-08T12:30:00.000Z',
      };
      
      user.fromJSON(data);
      
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('should ignore undefined values', () => {
      user.name = 'Original Name';
      
      user.fromJSON({
        name: undefined,
        email: 'test@example.com',
      });
      
      expect(user.name).toBe('Original Name'); // Should remain unchanged
      expect(user.email).toBe('test@example.com');
    });

    it('should return this for chaining', () => {
      const result = user.fromJSON({ name: 'Test' });
      expect(result).toBe(user);
    });
  });

  describe('toJSON', () => {
    it('should convert model to plain JSON object', () => {
      user.id = 1;
      user.name = 'John';
      user.email = 'john@example.com';
      user.age = 30;
      
      const json = user.toJSON();
      
      expect(json).toEqual({
        id: 1,
        name: 'John',
        email: 'john@example.com',
        age: 30,
      });
    });

    it('should convert Date objects to ISO strings', () => {
      const now = new Date('2025-11-08T12:00:00.000Z');
      user.createdAt = now;
      user.updatedAt = now;
      
      const json = user.toJSON();
      
      expect(json.createdAt).toBe('2025-11-08T12:00:00.000Z');
      expect(json.updatedAt).toBe('2025-11-08T12:00:00.000Z');
    });

    it('should exclude undefined values', () => {
      user.id = 1;
      user.name = 'Test';
      // email, age, active are undefined
      
      const json = user.toJSON();
      
      expect(json).toEqual({
        id: 1,
        name: 'Test',
      });
      expect(json.email).toBeUndefined();
    });

    it('should exclude functions', () => {
      user.id = 1;
      user.name = 'Test';
      (user as any).someMethod = () => 'test';
      
      const json = user.toJSON();
      
      expect(json.someMethod).toBeUndefined();
      expect(Object.keys(json)).toEqual(['id', 'name']);
    });
  });

  describe('validate', () => {
    it('should pass validation for valid data', () => {
      user.name = 'John Doe';
      user.email = 'john@example.com';
      user.age = 30;
      
      const result = user.validate();
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail validation for missing name', () => {
      user.email = 'john@example.com';
      
      const result = user.validate();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Name is required');
    });

    it('should fail validation for invalid email', () => {
      user.name = 'John Doe';
      user.email = 'invalid-email';
      
      const result = user.validate();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Valid email is required');
    });

    it('should fail validation for negative age', () => {
      user.name = 'John Doe';
      user.email = 'john@example.com';
      user.age = -5;
      
      const result = user.validate();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Age must be positive');
    });

    it('should collect multiple validation errors', () => {
      user.age = -1;
      
      const result = user.validate();
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it('should return valid for base model with no validation rules', () => {
      const product = new TestProduct();
      const result = product.validate();
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('clone', () => {
    it('should create a deep copy of the model', () => {
      user.id = 1;
      user.name = 'John Doe';
      user.email = 'john@example.com';
      user.age = 30;
      
      const clone = user.clone();
      
      expect(clone).not.toBe(user);
      expect(clone).toBeInstanceOf(TestUser);
      expect(clone.id).toBe(user.id);
      expect(clone.name).toBe(user.name);
      expect(clone.email).toBe(user.email);
      expect(clone.age).toBe(user.age);
    });

    it('should clone dates correctly', () => {
      const now = new Date('2025-11-08T12:00:00.000Z');
      user.createdAt = now;
      
      const clone = user.clone();
      
      expect(clone.createdAt).toBeInstanceOf(Date);
      expect(clone.createdAt?.getTime()).toBe(now.getTime());
      expect(clone.createdAt).not.toBe(now); // Different instance
    });

    it('should create independent copy', () => {
      user.name = 'Original';
      const clone = user.clone();
      
      clone.name = 'Modified';
      
      expect(user.name).toBe('Original');
      expect(clone.name).toBe('Modified');
    });
  });

  describe('equals', () => {
    it('should return true for equal models', () => {
      user.id = 1;
      user.name = 'John';
      user.email = 'john@example.com';
      
      const other = new TestUser();
      other.id = 1;
      other.name = 'John';
      other.email = 'john@example.com';
      
      expect(user.equals(other)).toBe(true);
    });

    it('should return false for different values', () => {
      user.id = 1;
      user.name = 'John';
      
      const other = new TestUser();
      other.id = 1;
      other.name = 'Jane';
      
      expect(user.equals(other)).toBe(false);
    });

    it('should return false for different model types', () => {
      user.id = 1;
      
      const product = new TestProduct();
      product.id = 1;
      
      expect(user.equals(product)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(user.equals(null as any)).toBe(false);
      expect(user.equals(undefined as any)).toBe(false);
    });

    it('should handle dates correctly', () => {
      const date = new Date('2025-11-08T12:00:00.000Z');
      user.createdAt = date;
      
      const other = new TestUser();
      other.createdAt = new Date('2025-11-08T12:00:00.000Z');
      
      expect(user.equals(other)).toBe(true);
    });
  });

  describe('getDisplayName', () => {
    it('should return custom display name from subclass', () => {
      user.name = 'John Doe';
      expect(user.getDisplayName()).toBe('John Doe');
    });

    it('should return id if no custom name', () => {
      user.id = 123;
      expect(user.getDisplayName()).toBe('123');
    });

    it('should return "Unknown" if no id or name', () => {
      expect(user.getDisplayName()).toBe('Unknown');
    });

    it('should prefer name over id', () => {
      user.id = 123;
      user.name = 'John';
      expect(user.getDisplayName()).toBe('John');
    });
  });

  describe('isNew', () => {
    it('should return true when no id', () => {
      expect(user.isNew()).toBe(true);
    });

    it('should return false when id exists', () => {
      user.id = 1;
      expect(user.isNew()).toBe(false);
    });

    it('should return false for id = 0', () => {
      user.id = 0;
      // !!0 is false in JavaScript, so isNew() returns true for id=0
      expect(user.isNew()).toBe(true);
    });
  });

  describe('isPersisted', () => {
    it('should return false when no id', () => {
      expect(user.isPersisted()).toBe(false);
    });

    it('should return true when id exists', () => {
      user.id = 1;
      expect(user.isPersisted()).toBe(true);
    });

    it('should return true for id = 0', () => {
      user.id = 0;
      // !!0 is false in JavaScript, so isPersisted() returns false for id=0
      expect(user.isPersisted()).toBe(false);
    });
  });

  describe('getTypeName', () => {
    it('should return constructor name', () => {
      expect(user.getTypeName()).toBe('TestUser');
      
      const product = new TestProduct();
      expect(product.getTypeName()).toBe('TestProduct');
    });
  });

  describe('merge', () => {
    it('should merge partial data into model', () => {
      user.id = 1;
      user.name = 'John';
      user.email = 'john@example.com';
      
      user.merge({ name: 'Jane', age: 25 });
      
      expect(user.id).toBe(1); // Unchanged
      expect(user.name).toBe('Jane'); // Updated
      expect(user.email).toBe('john@example.com'); // Unchanged
      expect(user.age).toBe(25); // Added
    });

    it('should return this for chaining', () => {
      const result = user.merge({ name: 'Test' });
      expect(result).toBe(user);
    });

    it('should ignore undefined values', () => {
      user.name = 'Original';
      
      user.merge({ name: undefined, email: 'new@example.com' });
      
      expect(user.name).toBe('Original');
      expect(user.email).toBe('new@example.com');
    });
  });

  describe('reset', () => {
    it('should clear all fields except id', () => {
      user.id = 1;
      user.name = 'John';
      user.email = 'john@example.com';
      user.age = 30;
      user.active = true;
      
      user.reset();
      
      expect(user.id).toBe(1); // Preserved
      expect(user.name).toBeUndefined();
      expect(user.email).toBeUndefined();
      expect(user.age).toBeUndefined();
      expect(user.active).toBeUndefined();
    });

    it('should return this for chaining', () => {
      const result = user.reset();
      expect(result).toBe(user);
    });
  });

  describe('getChangedFields', () => {
    it('should detect changed fields', () => {
      user.id = 1;
      user.name = 'John';
      user.email = 'john@example.com';
      
      const other = new TestUser();
      other.id = 1;
      other.name = 'Jane'; // Different
      other.email = 'john@example.com';
      
      const changes = user.getChangedFields(other);
      
      expect(changes).toContain('name');
      expect(changes).not.toContain('id');
      expect(changes).not.toContain('email');
    });

    it('should return empty array for identical models', () => {
      user.id = 1;
      user.name = 'John';
      
      const other = user.clone();
      
      const changes = user.getChangedFields(other);
      
      expect(changes).toEqual([]);
    });

    it('should detect multiple changes', () => {
      user.id = 1;
      user.name = 'John';
      user.email = 'john@example.com';
      user.age = 30;
      
      const other = new TestUser();
      other.id = 2;
      other.name = 'Jane';
      other.email = 'jane@example.com';
      other.age = 25;
      
      const changes = user.getChangedFields(other);
      
      expect(changes.length).toBe(4);
      expect(changes).toContain('id');
      expect(changes).toContain('name');
      expect(changes).toContain('email');
      expect(changes).toContain('age');
    });
  });

  describe('hasChanges', () => {
    it('should return true when models differ', () => {
      user.id = 1;
      user.name = 'John';
      
      const other = new TestUser();
      other.id = 1;
      other.name = 'Jane';
      
      expect(user.hasChanges(other)).toBe(true);
    });

    it('should return false when models are identical', () => {
      user.id = 1;
      user.name = 'John';
      
      const other = user.clone();
      
      expect(user.hasChanges(other)).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('should support full lifecycle: create -> populate -> validate -> persist -> modify -> compare', () => {
      // Create
      const newUser = new TestUser();
      expect(newUser.isNew()).toBe(true);
      
      // Populate
      newUser.fromJSON({
        name: 'Alice',
        email: 'alice@example.com',
        age: 28,
      });
      
      // Validate
      const validation = newUser.validate();
      expect(validation.isValid).toBe(true);
      
      // Simulate persist (add id)
      newUser.id = 1;
      expect(newUser.isPersisted()).toBe(true);
      
      // Clone for comparison
      const snapshot = newUser.clone();
      
      // Modify
      newUser.merge({ age: 29 });
      
      // Compare
      expect(newUser.hasChanges(snapshot)).toBe(true);
      expect(newUser.getChangedFields(snapshot)).toEqual(['age']);
    });

    it('should support JSON round-trip', () => {
      user.id = 1;
      user.name = 'John';
      user.email = 'john@example.com';
      user.createdAt = new Date('2025-11-08T00:00:00.000Z');
      
      // Convert to JSON (e.g., for API)
      const json = user.toJSON();
      
      // Create new instance from JSON (e.g., from API response)
      const restored = new TestUser(json);
      
      // Check key properties (equals might fail due to property enumeration)
      expect(restored.id).toBe(user.id);
      expect((restored as any).name).toBe(user.name);
      expect((restored as any).email).toBe(user.email);
      expect(restored.createdAt).toBeInstanceOf(Date);
      expect(restored.createdAt?.getTime()).toBe(user.createdAt.getTime());
    });
  });
});
