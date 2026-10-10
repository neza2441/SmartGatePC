<?php

namespace App\Http\Controllers;

use App\Models\Computer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ComputerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless(in_array($request->user()->role, ['student', 'administrator'], true), 403);

        $computers = Computer::with('owner')
            ->when($request->user()->role === 'student', fn ($query) => $query->where('user_id', $request->user()->id))
            ->latest()
            ->get();

        return response()->json(['data' => $computers->map(fn (Computer $computer) => $this->serialize($computer))]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'manufacturer' => ['required', 'string', 'max:80'],
            'model' => ['required', 'string', 'max:120'],
            'serial_number' => ['required', 'string', 'min:5', 'max:120', 'unique:computers,serial_number'],
        ]);
        $data['serial_number'] = Str::upper(trim($data['serial_number']));
        validator($data, ['serial_number' => ['unique:computers,serial_number']])->validate();

        $computer = $request->user()->computers()->create([...$data, 'status' => 'pending_review']);
        $computer->load('owner');

        return response()->json(['data' => $this->serialize($computer)], 201);
    }

    public function qr(Request $request, Computer $computer): JsonResponse
    {
        abort_unless($request->user()->role === 'administrator' || $computer->user_id === $request->user()->id, 403);

        return response()->json(['token' => $computer->qrCodeToken()]);
    }

    public function updateStatus(Request $request, Computer $computer): JsonResponse
    {
        $data = $request->validate(['status' => ['required', Rule::in(['verified', 'pending_review', 'rejected'])]]);
        $computer->update(['status' => $data['status'], 'reviewed_by' => $request->user()->id]);
        $computer->load('owner');

        return response()->json(['data' => $this->serialize($computer)]);
    }

    public function update(Request $request, Computer $computer): JsonResponse
    {
        $data = $request->validate([
            'user_id' => ['required', Rule::exists('users', 'id')->where(fn ($query) => $query->where('role', 'student'))],
            'manufacturer' => ['required', 'string', 'max:80'],
            'model' => ['required', 'string', 'max:120'],
            'serial_number' => ['required', 'string', 'min:5', 'max:120', Rule::unique('computers', 'serial_number')->ignore($computer->id)],
            'status' => ['required', Rule::in(['verified', 'pending_review', 'rejected'])],
        ]);
        $data['serial_number'] = Str::upper(trim($data['serial_number']));
        validator($data, ['serial_number' => ['unique:computers,serial_number,'.$computer->id]])->validate();
        if ($data['status'] !== $computer->status) {
            $data['reviewed_by'] = $request->user()->id;
        }
        $computer->update($data);
        $computer->load('owner');

        return response()->json(['data' => $this->serialize($computer)]);
    }

    public function destroy(Computer $computer): JsonResponse
    {
        $computer->delete();

        return response()->json(['message' => 'Device removed.']);
    }

    private function serialize(Computer $computer): array
    {
        return [
            'id' => $computer->id,
            'ownerId' => $computer->user_id,
            'studentId' => $computer->owner?->student_id,
            'student' => $computer->owner?->name,
            'email' => $computer->owner?->email,
            'brand' => $computer->manufacturer,
            'model' => $computer->model,
            'serial' => $computer->serial_number,
            'registeredAt' => $computer->created_at?->toDateString(),
            'status' => match ($computer->status) {
                'verified' => 'Verified',
                'pending_review' => 'Pending review',
                'rejected' => 'Rejected',
                default => 'Not registered',
            },
            'qrToken' => $computer->qrCodeToken(),
        ];
    }
}