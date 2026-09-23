<?php
// repositories/CategoryRepository.php

require_once __DIR__ . '/../config/Database.php';

class CategoryRepository {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function getAll(): array {
        $stmt = $this->db->query("SELECT * FROM categories ORDER BY name ASC");
        return $stmt->fetchAll();
    }

    public function getById(int $id): ?array {
        $stmt = $this->db->prepare("SELECT * FROM categories WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $id]);
        return $stmt->fetch() ?: null;
    }

    public function create(string $name, string $slug, string $icon, string $description): int {
        $stmt = $this->db->prepare("
            INSERT INTO categories (name, slug, icon, description)
            VALUES (:name, :slug, :icon, :description)
        ");
        $stmt->execute([
            ':name'        => $name,
            ':slug'        => $slug,
            ':icon'        => $icon,
            ':description' => $description
        ]);
        return (int)$this->db->lastInsertId();
    }
}
