<?php
session_start();

// Configuración
$DEFAULT_PASSWORD = '123456'; // Clave para acceso administrativo
$UPLOAD_DIR = 'data/';
$MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
$ALLOWED_EXTENSIONS = ['csv'];

// Verificar si el usuario ya está autenticado
$isAuthenticated = isset($_SESSION['authenticated']) && $_SESSION['authenticated'] === true;

// Procesar inicio de sesión
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password'])) {
    if ($_POST['password'] === $DEFAULT_PASSWORD) {
        $_SESSION['authenticated'] = true;
        $isAuthenticated = true;
    } else {
        $error = "Contraseña incorrecta";
    }
}

// Procesar cierre de sesión
if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: ' . $_SERVER['PHP_SELF']);
    exit;
}

// Procesar subida de archivos si está autenticado
$uploadResults = [];
if ($isAuthenticated && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['csv_files'])) {
    // Crear directorio si no existe
    if (!file_exists($UPLOAD_DIR)) {
        mkdir($UPLOAD_DIR, 0755, true);
    }
    
    foreach ($_FILES['csv_files']['name'] as $index => $name) {
        $tmpName = $_FILES['csv_files']['tmp_name'][$index];
        $error = $_FILES['csv_files']['error'][$index];
        $size = $_FILES['csv_files']['size'][$index];
        
        // Validar errores de subida
        if ($error !== UPLOAD_ERR_OK) {
            $uploadResults[] = [
                'file' => $name,
                'status' => 'error',
                'message' => getUploadErrorMessage($error)
            ];
            continue;
        }
        
        // Validar tamaño
        if ($size > $MAX_FILE_SIZE) {
            $uploadResults[] = [
                'file' => $name,
                'status' => 'error',
                'message' => "El archivo excede el tamaño máximo de 5 MB"
            ];
            continue;
        }
        
        // Validar extensión
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (!in_array($extension, $ALLOWED_EXTENSIONS)) {
            $uploadResults[] = [
                'file' => $name,
                'status' => 'error',
                'message' => "Solo se permiten archivos CSV"
            ];
            continue;
        }
        
        // Sanitizar nombre de archivo
        $sanitizedName = sanitizeFileName($name);
        if ($sanitizedName !== $name) {
            $uploadResults[] = [
                'file' => $name,
                'status' => 'error',
                'message' => "Nombre de archivo no válido. Use solo letras, números, guiones, guiones bajos y puntos"
            ];
            continue;
        }
        
        // Mover archivo al directorio de destino
        $destination = $UPLOAD_DIR . $sanitizedName;
        if (move_uploaded_file($tmpName, $destination)) {
            $uploadResults[] = [
                'file' => $sanitizedName,
                'status' => 'success',
                'message' => "Archivo subido correctamente"
            ];
        } else {
            $uploadResults[] = [
                'file' => $name,
                'status' => 'error',
                'message' => "Error al guardar el archivo en el servidor"
            ];
        }
    }
}

// Si se solicita JSON, devolver solo los resultados
if (isset($_GET['format']) && $_GET['format'] === 'json') {
    header('Content-Type: application/json');
    echo json_encode($uploadResults);
    exit;
}

// Función para obtener mensaje de error de subida
function getUploadErrorMessage($errorCode) {
    switch ($errorCode) {
        case UPLOAD_ERR_INI_SIZE:
        case UPLOAD_ERR_FORM_SIZE:
            return "El archivo es demasiado grande";
        case UPLOAD_ERR_PARTIAL:
            return "El archivo se subió solo parcialmente";
        case UPLOAD_ERR_NO_FILE:
            return "No se subió ningún archivo";
        case UPLOAD_ERR_NO_TMP_DIR:
            return "Falta el directorio temporal";
        case UPLOAD_ERR_CANT_WRITE:
            return "Error al escribir el archivo en el disco";
        case UPLOAD_ERR_EXTENSION:
            return "Una extensión de PHP detuvo la subida del archivo";
        default:
            return "Error desconocido al subir el archivo";
    }
}

// Función para sanitizar nombre de archivo
function sanitizeFileName($filename) {
    // Permitir solo letras, números, guiones, guiones bajos y puntos
    $sanitized = preg_replace('/[^a-zA-Z0-9\-_.]/', '', $filename);
    return $sanitized;
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Subir Listas de Precios</title>
    <style>
        :root {
            --bg-primary: #121212;
            --bg-secondary: #1e1e1e;
            --text-primary: #ffffff;
            --text-secondary: #b0b0b0;
            --accent: #ff7b00;
            --accent-hover: #ff9a3d;
            --border: #444444;
            --success: #4caf50;
            --error: #f44336;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
            padding: 20px;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
        }

        header {
            margin-bottom: 30px;
            text-align: center;
        }

        h1 {
            color: var(--accent);
            margin-bottom: 10px;
        }

        .card {
            background-color: var(--bg-secondary);
            border-radius: 8px;
            padding: 30px;
            margin-bottom: 20px;
            border: 1px solid var(--border);
        }

        .login-form, .upload-form {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        input[type="password"], input[type="file"] {
            width: 100%;
            padding: 12px 15px;
            background-color: var(--bg-primary);
            border: 1px solid var(--border);
            border-radius: 4px;
            color: var(--text-primary);
            font-size: 16px;
        }

        input:focus {
            outline: none;
            border-color: var(--accent);
        }

        button {
            padding: 12px 20px;
            background-color: var(--accent);
            color: var(--bg-primary);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 600;
            transition: background-color 0.2s;
        }

        button:hover {
            background-color: var(--accent-hover);
        }

        .logout-btn {
            background-color: transparent;
            color: var(--text-secondary);
            border: 1px solid var(--border);
        }

        .logout-btn:hover {
            background-color: var(--bg-primary);
        }

        .message {
            padding: 10px 15px;
            border-radius: 4px;
            margin-bottom: 15px;
        }

        .message.error {
            background-color: rgba(244, 67, 54, 0.2);
            border: 1px solid var(--error);
        }

        .message.success {
            background-color: rgba(76, 175, 80, 0.2);
            border: 1px solid var(--success);
        }

        .upload-results {
            margin-top: 20px;
        }

        .result-item {
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .result-item.success {
            background-color: rgba(76, 175, 80, 0.1);
            border-left: 4px solid var(--success);
        }

        .result-item.error {
            background-color: rgba(244, 67, 54, 0.1);
            border-left: 4px solid var(--error);
        }

        .file-info {
            font-weight: 600;
        }

        .status-message {
            color: var(--text-secondary);
        }

        .help-text {
            color: var(--text-secondary);
            font-size: 14px;
            margin-top: 5px;
        }

        .file-list {
            margin-top: 10px;
        }

        .file-list-item {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid var(--border);
        }

        .file-list-item:last-child {
            border-bottom: none;
        }

        @media (max-width: 600px) {
            .container {
                padding: 10px;
            }
            
            .card {
                padding: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Subir Listas de Precios</h1>
            <p>Administración de archivos CSV para el buscador de precios</p>
        </header>

        <?php if (!$isAuthenticated): ?>
            <!-- Formulario de login -->
            <div class="card">
                <h2>Acceso restringido</h2>
                <?php if (isset($error)): ?>
                    <div class="message error"><?php echo htmlspecialchars($error); ?></div>
                <?php endif; ?>
                
                <form method="POST" class="login-form">
                    <div>
                        <label for="password">Contraseña:</label>
                        <input type="password" id="password" name="password" required>
                    </div>
                    <button type="submit">Acceder</button>
                </form>
            </div>
        <?php else: ?>
            <!-- Panel de administración -->
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2>Subir archivos CSV</h2>
                    <a href="?logout=1" class="logout-btn" style="text-decoration: none;">
                        <button class="logout-btn">Cerrar sesión</button>
                    </a>
                </div>

                <?php if (!empty($uploadResults)): ?>
                    <div class="upload-results">
                        <h3>Resultados de la subida:</h3>
                        <?php foreach ($uploadResults as $result): ?>
                            <div class="result-item <?php echo $result['status']; ?>">
                                <div class="file-info"><?php echo htmlspecialchars($result['file']); ?></div>
                                <div class="status-message"><?php echo htmlspecialchars($result['message']); ?></div>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>

                <form method="POST" enctype="multipart/form-data" class="upload-form">
                    <div>
                        <label for="csv_files">Seleccionar archivos CSV:</label>
                        <input type="file" id="csv_files" name="csv_files[]" multiple accept=".csv" required>
                        <div class="help-text">
                            Formatos aceptados: CSV. Tamaño máximo por archivo: 5 MB.
                            Nombres permitidos: solo letras, números, guiones, guiones bajos y puntos.
                        </div>
                    </div>
                    <button type="submit">Subir archivos</button>
                </form>
            </div>

            <div class="card">
                <h3>Archivos actuales en el servidor</h3>
                <div class="file-list">
                    <?php
                    if (file_exists($UPLOAD_DIR)) {
                        $files = scandir($UPLOAD_DIR);
                        $csvFiles = array_filter($files, function($file) {
                            return pathinfo($file, PATHINFO_EXTENSION) === 'csv';
                        });
                        
                        if (empty($csvFiles)) {
                            echo '<p>No hay archivos CSV en el servidor.</p>';
                        } else {
                            foreach ($csvFiles as $file) {
                                $fileSize = filesize($UPLOAD_DIR . $file);
                                $fileDate = date('d/m/Y H:i', filemtime($UPLOAD_DIR . $file));
                                echo "<div class='file-list-item'>";
                                echo "<div><strong>" . htmlspecialchars($file) . "</strong></div>";
                                echo "<div>" . number_format($fileSize / 1024, 2) . " KB - " . $fileDate . "</div>";
                                echo "</div>";
                            }
                        }
                    } else {
                        echo '<p>La carpeta data/ no existe.</p>';
                    }
                    ?>
                </div>
            </div>

            <div class="card">
                <h3>Instrucciones</h3>
                <ul style="padding-left: 20px; margin-top: 10px;">
                    <li>Los archivos CSV deben tener los encabezados: <code>marca,modelo,tipo,proveedor,precio_compra,precio_venta,notas</code></li>
                    <li>El campo <strong>precio_compra</strong> es obligatorio y debe ser numérico</li>
                    <li>El campo <strong>tipo</strong> debe ser "OLED" o "LCD"</li>
                    <li>Los archivos se guardarán en la carpeta <code>/data/</code> del servidor</li>
                    <li>Los archivos existentes con el mismo nombre serán reemplazados</li>
                    <li>Después de subir los archivos, actualice la página del buscador para ver los cambios</li>
                </ul>
                
                <div style="margin-top: 15px; padding: 15px; background-color: var(--bg-primary); border-radius: 4px;">
                    <h4>Ejemplo de formato CSV:</h4>
                    <pre style="color: var(--text-secondary); font-size: 12px; margin-top: 10px;">
marca,modelo,tipo,proveedor,precio_compra,precio_venta,notas
Samsung,A32,OLED,J&A,320.0,490.0,
Samsung,A32,LCD,J&A,170.0,330.0,
Xiaomi,Redmi Note 12,OLED,J&A,380.0,590.0,
Xiaomi,Redmi Note 12,LCD,J&A,150.0,300.0,</pre>
                </div>
            </div>
        <?php endif; ?>
    </div>
</body>
</html>